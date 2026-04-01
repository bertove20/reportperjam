/**
 * Finance Transactions — CRUD + export
 */

import { query, queryRows, queryOne } from '../../storage/postgres.js';
import { allocateFifo, reverseFifo } from '../../storage/fifo-store.js';
import { requireEdit } from '../../middleware/auth.js';

export default async function (app) {
  // GET /api/finance/transactions
  app.get('/api/finance/transactions', async (request) => {
    const { month, year, brand_id, bank_id, payment_method_id, category_id, team_id, search, page = 1, limit = 50 } = request.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = 'WHERE 1=1';
    const params = [];
    let idx = 1;

    if (month && year) {
      where += ` AND EXTRACT(MONTH FROM t.transaction_date) = $${idx++} AND EXTRACT(YEAR FROM t.transaction_date) = $${idx++}`;
      params.push(parseInt(month), parseInt(year));
    }
    if (brand_id) { where += ` AND t.brand_id = $${idx++}`; params.push(parseInt(brand_id)); }
    if (payment_method_id) { where += ` AND t.payment_method_id = $${idx++}`; params.push(parseInt(payment_method_id)); }
    if (category_id) { where += ` AND t.category_id = $${idx++}`; params.push(parseInt(category_id)); }
    if (team_id) { where += ` AND t.team_id = $${idx++}`; params.push(parseInt(team_id)); }
    if (search) { where += ` AND (t.description ILIKE $${idx++} OR b.name ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

    const rows = await queryRows(`
      SELECT t.*, b.name as brand_name, pm.name as pm_name, pm.currency as pm_currency,
        bk.name as bank_name, ec.name as category_name, tm.name as team_name,
        u.username as created_by_name
      FROM transactions t
      LEFT JOIN finance_brands b ON t.brand_id = b.id
      LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
      LEFT JOIN banks bk ON pm.bank_id = bk.id
      LEFT JOIN expense_categories ec ON t.category_id = ec.id
      LEFT JOIN teams tm ON t.team_id = tm.id
      LEFT JOIN users u ON t.created_by = u.id
      ${where}
      ORDER BY t.transaction_date DESC, t.id DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, parseInt(limit), offset]);

    const total = await queryOne(`SELECT COUNT(*) as count FROM transactions t LEFT JOIN finance_brands b ON t.brand_id = b.id ${where}`, params);

    return { transactions: rows, total: parseInt(total.count), page: parseInt(page), limit: parseInt(limit) };
  });

  // GET /api/finance/transactions/:id
  app.get('/api/finance/transactions/:id', async (request) => {
    return queryOne(`
      SELECT t.*, b.name as brand_name, pm.name as pm_name, ec.name as category_name, tm.name as team_name
      FROM transactions t
      LEFT JOIN finance_brands b ON t.brand_id = b.id
      LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
      LEFT JOIN expense_categories ec ON t.category_id = ec.id
      LEFT JOIN teams tm ON t.team_id = tm.id
      WHERE t.id = $1
    `, [request.params.id]);
  });

  // POST /api/finance/transactions
  app.post('/api/finance/transactions', { preHandler: [requireEdit()] }, async (request) => {
    const { brand_ids, payment_method_id, category_id, team_id, amount, description, transaction_date } = request.body;
    const brands = Array.isArray(brand_ids) ? brand_ids : [brand_ids];

    // Get payment method currency
    const pm = await queryOne('SELECT currency FROM payment_methods WHERE id = $1', [payment_method_id]);
    const currency = pm?.currency || 'IDR';
    const amountNum = parseFloat(amount);

    const created = [];
    for (const brandId of brands) {
      const result = await query(`
        INSERT INTO transactions (brand_id, payment_method_id, category_id, team_id, amount, amount_idr, currency, description, transaction_date, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id
      `, [brandId, payment_method_id, category_id || null, team_id || null,
          amountNum, currency === 'IDR' ? amountNum : 0, currency,
          description || null, transaction_date, request.user.id]);

      const txId = result.rows[0].id;

      // Update balance
      await query('UPDATE payment_methods SET current_balance = current_balance - $1 WHERE id = $2', [amountNum, payment_method_id]);

      // FIFO for USD/USDT
      if (currency === 'USD' || currency === 'USDT') {
        const fifo = await allocateFifo(txId, payment_method_id, amountNum);
        if (fifo.costIdr) {
          await query('UPDATE transactions SET amount_idr = $1 WHERE id = $2', [fifo.costIdr, txId]);
        }
      }

      created.push(txId);
    }

    return { success: true, ids: created };
  });

  // PUT /api/finance/transactions/:id
  app.put('/api/finance/transactions/:id', { preHandler: [requireEdit()] }, async (request) => {
    const { id } = request.params;
    const { brand_id, payment_method_id, category_id, team_id, amount, description, transaction_date } = request.body;

    // Get old transaction
    const old = await queryOne('SELECT * FROM transactions WHERE id = $1', [id]);
    if (!old) return { error: 'Transaction not found' };

    // Reverse old balance
    await query('UPDATE payment_methods SET current_balance = current_balance + $1 WHERE id = $2', [old.amount, old.payment_method_id]);
    if (old.currency === 'USD' || old.currency === 'USDT') await reverseFifo(parseInt(id));

    // Get new currency
    const pm = await queryOne('SELECT currency FROM payment_methods WHERE id = $1', [payment_method_id || old.payment_method_id]);
    const currency = pm?.currency || old.currency;
    const amountNum = parseFloat(amount || old.amount);

    await query(`
      UPDATE transactions SET brand_id=$1, payment_method_id=$2, category_id=$3, team_id=$4,
        amount=$5, currency=$6, description=$7, transaction_date=$8, amount_idr=$9, updated_at=NOW()
      WHERE id = $10
    `, [brand_id || old.brand_id, payment_method_id || old.payment_method_id,
        category_id ?? old.category_id, team_id ?? old.team_id,
        amountNum, currency, description ?? old.description,
        transaction_date || old.transaction_date,
        currency === 'IDR' ? amountNum : 0, id]);

    // Apply new balance
    await query('UPDATE payment_methods SET current_balance = current_balance - $1 WHERE id = $2',
      [amountNum, payment_method_id || old.payment_method_id]);

    // FIFO
    if (currency === 'USD' || currency === 'USDT') {
      const fifo = await allocateFifo(parseInt(id), payment_method_id || old.payment_method_id, amountNum);
      if (fifo.costIdr) await query('UPDATE transactions SET amount_idr = $1 WHERE id = $2', [fifo.costIdr, id]);
    }

    return { success: true };
  });

  // DELETE /api/finance/transactions/:id
  app.delete('/api/finance/transactions/:id', { preHandler: [requireEdit()] }, async (request) => {
    const { id } = request.params;
    const tx = await queryOne('SELECT * FROM transactions WHERE id = $1', [id]);
    if (!tx) return { error: 'Not found' };

    // Restore balance
    await query('UPDATE payment_methods SET current_balance = current_balance + $1 WHERE id = $2', [tx.amount, tx.payment_method_id]);
    if (tx.currency === 'USD' || tx.currency === 'USDT') await reverseFifo(parseInt(id));

    await query('DELETE FROM transactions WHERE id = $1', [id]);
    return { success: true };
  });

  // GET /api/finance/transactions/form-data — dropdown data for forms
  app.get('/api/finance/transactions/form-data', async () => {
    const [brands, paymentMethods, categories, teams] = await Promise.all([
      queryRows('SELECT id, name FROM finance_brands WHERE is_active = 1 ORDER BY name'),
      queryRows('SELECT pm.id, pm.name, pm.currency, bk.name as bank_name FROM payment_methods pm JOIN banks bk ON pm.bank_id = bk.id WHERE pm.is_active = 1 ORDER BY bk.name, pm.name'),
      queryRows('SELECT ec.id, ec.name, tm.name as team_name FROM expense_categories ec LEFT JOIN teams tm ON ec.team_id = tm.id WHERE ec.is_active = 1 ORDER BY tm.name, ec.name'),
      queryRows('SELECT id, name FROM teams WHERE is_active = 1 ORDER BY name'),
    ]);
    return { brands, paymentMethods, categories, teams };
  });
}
