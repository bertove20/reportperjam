/**
 * Finance Balance — topup, transfer, history
 */

import { query, queryRows, queryOne } from '../../storage/postgres.js';
import { requireEdit } from '../../middleware/auth.js';

export default async function (app) {
  // Overview: all wallets grouped by bank
  app.get('/api/finance/balance', async () => {
    return queryRows(`
      SELECT pm.id, pm.name, pm.current_balance, pm.initial_balance, pm.currency, pm.type,
        bk.id as bank_id, bk.name as bank_name
      FROM payment_methods pm
      JOIN banks bk ON pm.bank_id = bk.id
      WHERE pm.is_active = 1
      ORDER BY bk.name, pm.name
    `);
  });

  // Topup
  app.post('/api/finance/balance/topup', { preHandler: [requireEdit()] }, async (request) => {
    const { payment_method_id, amount, exchange_rate, description, adjustment_date } = request.body;
    const amountNum = parseFloat(amount);
    const rate = parseFloat(exchange_rate) || null;
    const totalIdr = rate ? Math.round(amountNum * rate) : null;

    await query(`
      INSERT INTO balance_adjustments (payment_method_id, amount, type, description, adjustment_date, exchange_rate, total_idr, remaining_amount, created_by)
      VALUES ($1, $2, 'topup', $3, $4, $5, $6, $7, $8)
    `, [payment_method_id, amountNum, description || null, adjustment_date || new Date().toISOString().split('T')[0],
        rate, totalIdr, amountNum, request.user.id]);

    await query('UPDATE payment_methods SET current_balance = current_balance + $1 WHERE id = $2', [amountNum, payment_method_id]);
    return { success: true };
  });

  // Transfer (same bank only)
  app.post('/api/finance/balance/transfer', { preHandler: [requireEdit()] }, async (request) => {
    const { from_id, to_id, amount, description } = request.body;
    const amountNum = parseFloat(amount);

    const fromPm = await queryOne('SELECT bank_id FROM payment_methods WHERE id = $1', [from_id]);
    const toPm = await queryOne('SELECT bank_id FROM payment_methods WHERE id = $1', [to_id]);
    if (fromPm.bank_id !== toPm.bank_id) return { error: 'Transfer only allowed within same bank' };

    const today = new Date().toISOString().split('T')[0];
    await query('INSERT INTO balance_adjustments (payment_method_id, amount, type, description, adjustment_date, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
      [from_id, -amountNum, 'transfer', description || `Transfer out`, today, request.user.id]);
    await query('INSERT INTO balance_adjustments (payment_method_id, amount, type, description, adjustment_date, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
      [to_id, amountNum, 'transfer', description || `Transfer in`, today, request.user.id]);

    await query('UPDATE payment_methods SET current_balance = current_balance - $1 WHERE id = $2', [amountNum, from_id]);
    await query('UPDATE payment_methods SET current_balance = current_balance + $1 WHERE id = $2', [amountNum, to_id]);
    return { success: true };
  });

  // History for one wallet
  app.get('/api/finance/balance/history/:id', async (request) => {
    const adjustments = await queryRows(
      'SELECT * FROM balance_adjustments WHERE payment_method_id = $1 ORDER BY adjustment_date DESC, id DESC LIMIT 100',
      [request.params.id]
    );
    const transactions = await queryRows(`
      SELECT t.id, t.amount, t.currency, t.description, t.transaction_date, b.name as brand_name
      FROM transactions t LEFT JOIN finance_brands b ON t.brand_id = b.id
      WHERE t.payment_method_id = $1
      ORDER BY t.transaction_date DESC LIMIT 100
    `, [request.params.id]);

    const pm = await queryOne('SELECT * FROM payment_methods WHERE id = $1', [request.params.id]);
    return { paymentMethod: pm, adjustments, transactions };
  });

  // Edit adjustment
  app.put('/api/finance/balance/adjustment/:id', { preHandler: [requireEdit()] }, async (request) => {
    const { amount, exchange_rate, description } = request.body;
    const old = await queryOne('SELECT * FROM balance_adjustments WHERE id = $1', [request.params.id]);
    if (!old) return { error: 'Not found' };

    const newAmount = parseFloat(amount);
    const diff = newAmount - parseFloat(old.amount);

    await query('UPDATE balance_adjustments SET amount=$1, exchange_rate=$2, description=$3 WHERE id=$4',
      [newAmount, exchange_rate || null, description, request.params.id]);
    await query('UPDATE payment_methods SET current_balance = current_balance + $1 WHERE id = $2', [diff, old.payment_method_id]);
    return { success: true };
  });

  // Delete adjustment
  app.delete('/api/finance/balance/adjustment/:id', { preHandler: [requireEdit()] }, async (request) => {
    const adj = await queryOne('SELECT * FROM balance_adjustments WHERE id = $1', [request.params.id]);
    if (!adj) return { error: 'Not found' };

    await query('UPDATE payment_methods SET current_balance = current_balance - $1 WHERE id = $2', [adj.amount, adj.payment_method_id]);
    await query('DELETE FROM balance_adjustments WHERE id = $1', [request.params.id]);
    return { success: true };
  });
}
