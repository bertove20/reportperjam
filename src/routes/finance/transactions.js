/**
 * Finance Transactions — CRUD + export
 */

import { query, queryRows, queryOne } from '../../storage/postgres.js';
import { allocateFifo, reverseFifo } from '../../storage/fifo-store.js';
import { requireEdit } from '../../middleware/auth.js';
import { tWhere } from '../../middleware/tenant-scope.js';

export default async function (app) {
  // GET /api/finance/transactions
  app.get('/api/finance/transactions', async (request) => {
    const tid = request.tenantId;
    const { month, year, brand_id, bank_id, payment_method_id, category_id, team_id, search, page = 1, limit = 50 } = request.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = 'WHERE t.tenant_id = $1';
    const params = [tid];
    let idx = 2;

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
    const tid = request.tenantId;
    return queryOne(`
      SELECT t.*, b.name as brand_name, pm.name as pm_name, ec.name as category_name, tm.name as team_name
      FROM transactions t
      LEFT JOIN finance_brands b ON t.brand_id = b.id
      LEFT JOIN payment_methods pm ON t.payment_method_id = pm.id
      LEFT JOIN expense_categories ec ON t.category_id = ec.id
      LEFT JOIN teams tm ON t.team_id = tm.id
      WHERE t.id = $1 AND t.tenant_id = $2
    `, [request.params.id, tid]);
  });

  // POST /api/finance/transactions
  app.post('/api/finance/transactions', { preHandler: [requireEdit()] }, async (request) => {
    const tid = request.tenantId;
    const { brand_ids, payment_method_id, category_id, team_id, amount, description, transaction_date } = request.body;
    const brands = Array.isArray(brand_ids) ? brand_ids : [brand_ids];

    // Get payment method currency
    const pm = await queryOne('SELECT currency FROM payment_methods WHERE id = $1 AND tenant_id = $2', [payment_method_id, tid]);
    const currency = pm?.currency || 'IDR';
    const amountNum = parseFloat(amount);

    const created = [];
    for (const brandId of brands) {
      const result = await query(`
        INSERT INTO transactions (brand_id, payment_method_id, category_id, team_id, amount, amount_idr, currency, description, transaction_date, created_by, tenant_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id
      `, [brandId, payment_method_id, category_id || null, team_id || null,
          amountNum, currency === 'IDR' ? amountNum : 0, currency,
          description || null, transaction_date, request.user.id, tid]);

      const txId = result.rows[0].id;

      // Update balance
      await query('UPDATE payment_methods SET current_balance = current_balance - $1 WHERE id = $2 AND tenant_id = $3', [amountNum, payment_method_id, tid]);

      // FIFO for USD/USDT
      if (currency === 'USD' || currency === 'USDT') {
        const fifo = await allocateFifo(txId, payment_method_id, amountNum);
        if (fifo.costIdr) {
          await query('UPDATE transactions SET amount_idr = $1 WHERE id = $2 AND tenant_id = $3', [fifo.costIdr, txId, tid]);
        }
      }

      created.push(txId);
    }

    return { success: true, ids: created };
  });

  // PUT /api/finance/transactions/:id
  app.put('/api/finance/transactions/:id', { preHandler: [requireEdit()] }, async (request) => {
    const tid = request.tenantId;
    const { id } = request.params;
    const { brand_id, payment_method_id, category_id, team_id, amount, description, transaction_date } = request.body;

    // Get old transaction
    const old = await queryOne('SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2', [id, tid]);
    if (!old) return { error: 'Transaction not found' };

    // Reverse old balance
    await query('UPDATE payment_methods SET current_balance = current_balance + $1 WHERE id = $2 AND tenant_id = $3', [old.amount, old.payment_method_id, tid]);
    if (old.currency === 'USD' || old.currency === 'USDT') await reverseFifo(parseInt(id));

    // Get new currency
    const pm = await queryOne('SELECT currency FROM payment_methods WHERE id = $1 AND tenant_id = $2', [payment_method_id || old.payment_method_id, tid]);
    const currency = pm?.currency || old.currency;
    const amountNum = parseFloat(amount || old.amount);

    await query(`
      UPDATE transactions SET brand_id=$1, payment_method_id=$2, category_id=$3, team_id=$4,
        amount=$5, currency=$6, description=$7, transaction_date=$8, amount_idr=$9, updated_at=NOW()
      WHERE id = $10 AND tenant_id = $11
    `, [brand_id || old.brand_id, payment_method_id || old.payment_method_id,
        category_id ?? old.category_id, team_id ?? old.team_id,
        amountNum, currency, description ?? old.description,
        transaction_date || old.transaction_date,
        currency === 'IDR' ? amountNum : 0, id, tid]);

    // Apply new balance
    await query('UPDATE payment_methods SET current_balance = current_balance - $1 WHERE id = $2 AND tenant_id = $3',
      [amountNum, payment_method_id || old.payment_method_id, tid]);

    // FIFO
    if (currency === 'USD' || currency === 'USDT') {
      const fifo = await allocateFifo(parseInt(id), payment_method_id || old.payment_method_id, amountNum);
      if (fifo.costIdr) await query('UPDATE transactions SET amount_idr = $1 WHERE id = $2 AND tenant_id = $3', [fifo.costIdr, id, tid]);
    }

    return { success: true };
  });

  // DELETE /api/finance/transactions/:id
  app.delete('/api/finance/transactions/:id', { preHandler: [requireEdit()] }, async (request) => {
    const tid = request.tenantId;
    const { id } = request.params;
    const tx = await queryOne('SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2', [id, tid]);
    if (!tx) return { error: 'Not found' };

    // Restore balance
    await query('UPDATE payment_methods SET current_balance = current_balance + $1 WHERE id = $2 AND tenant_id = $3', [tx.amount, tx.payment_method_id, tid]);
    if (tx.currency === 'USD' || tx.currency === 'USDT') await reverseFifo(parseInt(id));

    await query('DELETE FROM transactions WHERE id = $1 AND tenant_id = $2', [id, tid]);
    return { success: true };
  });

  // GET /api/finance/transactions/form-data — dropdown data for forms
  app.get('/api/finance/transactions/form-data', async (request) => {
    const tid = request.tenantId;
    const [brands, paymentMethods, categories, teams] = await Promise.all([
      queryRows('SELECT id, name FROM finance_brands WHERE is_active = 1 AND tenant_id = $1 ORDER BY name', [tid]),
      queryRows('SELECT pm.id, pm.name, pm.currency, bk.name as bank_name FROM payment_methods pm JOIN banks bk ON pm.bank_id = bk.id WHERE pm.is_active = 1 AND pm.tenant_id = $1 ORDER BY bk.name, pm.name', [tid]),
      queryRows('SELECT ec.id, ec.name, tm.name as team_name FROM expense_categories ec LEFT JOIN teams tm ON ec.team_id = tm.id WHERE ec.is_active = 1 AND ec.tenant_id = $1 ORDER BY tm.name, ec.name', [tid]),
      queryRows('SELECT id, name FROM teams WHERE is_active = 1 AND tenant_id = $1 ORDER BY name', [tid]),
    ]);
    return { brands, paymentMethods, categories, teams };
  });
}
