/**
 * Finance Banks — CRUD
 */

import { query, queryRows, queryOne } from '../../storage/postgres.js';
import { requireEdit } from '../../middleware/auth.js';

export default async function (app) {
  app.get('/api/finance/banks', async () => {
    return queryRows(`
      SELECT b.*,
        (SELECT COUNT(*) FROM payment_methods WHERE bank_id = b.id) as wallet_count,
        d.name as division_name
      FROM banks b
      LEFT JOIN divisions d ON b.division_id = d.id
      ORDER BY b.name
    `);
  });

  app.post('/api/finance/banks', { preHandler: [requireEdit()] }, async (request) => {
    const { name, currency, description, division_id } = request.body;
    const result = await query(
      'INSERT INTO banks (name, currency, description, division_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, currency || 'IDR', description || null, division_id || null]
    );
    return result.rows[0];
  });

  app.put('/api/finance/banks/:id', { preHandler: [requireEdit()] }, async (request) => {
    const { name, currency, description, division_id, is_active } = request.body;
    await query(
      'UPDATE banks SET name=COALESCE($1,name), currency=COALESCE($2,currency), description=COALESCE($3,description), division_id=COALESCE($4,division_id), is_active=COALESCE($5,is_active), updated_at=NOW() WHERE id=$6',
      [name, currency, description, division_id, is_active, request.params.id]
    );
    // Cascade currency to wallets
    if (currency) {
      await query('UPDATE payment_methods SET currency = $1 WHERE bank_id = $2', [currency, request.params.id]);
    }
    return { success: true };
  });

  app.delete('/api/finance/banks/:id', { preHandler: [requireEdit()] }, async (request) => {
    const wallets = await queryOne('SELECT COUNT(*) as c FROM payment_methods WHERE bank_id = $1', [request.params.id]);
    if (parseInt(wallets.c) > 0) return { error: 'Cannot delete bank with payment methods' };
    await query('DELETE FROM banks WHERE id = $1', [request.params.id]);
    return { success: true };
  });

  // API: wallets by bank (for dropdowns)
  app.get('/api/finance/banks/:id/wallets', async (request) => {
    return queryRows('SELECT id, name, currency, current_balance FROM payment_methods WHERE bank_id = $1 AND is_active = 1 ORDER BY name', [request.params.id]);
  });
}
