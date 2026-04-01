/**
 * Finance Payment Methods (Wallets) — CRUD
 */

import { query, queryRows, queryOne } from '../../storage/postgres.js';
import { requireEdit } from '../../middleware/auth.js';

export default async function (app) {
  app.get('/api/finance/payment-methods', async () => {
    return queryRows(`
      SELECT pm.*, bk.name as bank_name, bk.currency as bank_currency
      FROM payment_methods pm
      JOIN banks bk ON pm.bank_id = bk.id
      ORDER BY bk.name, pm.name
    `);
  });

  app.post('/api/finance/payment-methods', { preHandler: [requireEdit()] }, async (request) => {
    const { bank_id, name, type, initial_balance, description } = request.body;
    const bank = await queryOne('SELECT currency FROM banks WHERE id = $1', [bank_id]);
    const bal = parseFloat(initial_balance) || 0;
    const result = await query(
      'INSERT INTO payment_methods (bank_id, name, type, initial_balance, current_balance, currency, description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [bank_id, name, type || 'bank_account', bal, bal, bank?.currency || 'IDR', description || null]
    );
    return result.rows[0];
  });

  app.put('/api/finance/payment-methods/:id', { preHandler: [requireEdit()] }, async (request) => {
    const { name, type, initial_balance, description, is_active } = request.body;
    const old = await queryOne('SELECT initial_balance FROM payment_methods WHERE id = $1', [request.params.id]);
    const newBal = parseFloat(initial_balance);

    if (!isNaN(newBal) && old) {
      const diff = newBal - parseFloat(old.initial_balance);
      if (diff !== 0) {
        await query('UPDATE payment_methods SET current_balance = current_balance + $1 WHERE id = $2', [diff, request.params.id]);
      }
    }

    await query(
      'UPDATE payment_methods SET name=COALESCE($1,name), type=COALESCE($2,type), initial_balance=COALESCE($3,initial_balance), description=COALESCE($4,description), is_active=COALESCE($5,is_active), updated_at=NOW() WHERE id=$6',
      [name, type, initial_balance, description, is_active, request.params.id]
    );
    return { success: true };
  });

  app.delete('/api/finance/payment-methods/:id', { preHandler: [requireEdit()] }, async (request) => {
    const txCount = await queryOne('SELECT COUNT(*) as c FROM transactions WHERE payment_method_id = $1', [request.params.id]);
    if (parseInt(txCount.c) > 0) return { error: 'Cannot delete wallet with transactions' };
    await query('DELETE FROM payment_methods WHERE id = $1', [request.params.id]);
    return { success: true };
  });
}
