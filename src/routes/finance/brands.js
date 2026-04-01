/**
 * Finance Brands — CRUD + budget management
 */

import { query, queryRows, queryOne } from '../../storage/postgres.js';
import { requireEdit } from '../../middleware/auth.js';

export default async function (app) {
  app.get('/api/finance/brands', async () => {
    return queryRows(`
      SELECT b.*, d.name as division_name,
        COALESCE((SELECT SUM(budget_amount) FROM brand_budgets WHERE brand_id = b.id), 0) as total_budget,
        COALESCE((SELECT COUNT(*) FROM transactions WHERE brand_id = b.id), 0) as tx_count
      FROM finance_brands b
      LEFT JOIN divisions d ON b.division_id = d.id
      ORDER BY b.name
    `);
  });

  app.get('/api/finance/brands/:id', async (request) => {
    return queryOne('SELECT * FROM finance_brands WHERE id = $1', [request.params.id]);
  });

  app.post('/api/finance/brands', { preHandler: [requireEdit()] }, async (request) => {
    const { name, description, division_id } = request.body;
    const result = await query(
      'INSERT INTO finance_brands (name, description, division_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, division_id || null]
    );
    return result.rows[0];
  });

  app.put('/api/finance/brands/:id', { preHandler: [requireEdit()] }, async (request) => {
    const { name, description, division_id, is_active } = request.body;
    await query(
      'UPDATE finance_brands SET name=COALESCE($1,name), description=COALESCE($2,description), division_id=COALESCE($3,division_id), is_active=COALESCE($4,is_active), updated_at=NOW() WHERE id=$5',
      [name, description, division_id, is_active, request.params.id]
    );
    return { success: true };
  });

  app.delete('/api/finance/brands/:id', { preHandler: [requireEdit()] }, async (request) => {
    const txCount = await queryOne('SELECT COUNT(*) as c FROM transactions WHERE brand_id = $1', [request.params.id]);
    if (parseInt(txCount.c) > 0) return { error: 'Cannot delete brand with transactions' };
    await query('DELETE FROM finance_brands WHERE id = $1', [request.params.id]);
    return { success: true };
  });

  // ─── Budget ───
  app.get('/api/finance/brands/:id/budget', async (request) => {
    return queryRows('SELECT * FROM brand_budgets WHERE brand_id = $1 ORDER BY year DESC, month DESC', [request.params.id]);
  });

  app.post('/api/finance/brands/:id/budget', { preHandler: [requireEdit()] }, async (request) => {
    const { month, year, budget_amount, budget_idr, currency } = request.body;
    await query(`
      INSERT INTO brand_budgets (brand_id, month, year, budget_amount, budget_idr, currency)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT(brand_id, month, year) DO UPDATE SET
        budget_amount = EXCLUDED.budget_amount, budget_idr = EXCLUDED.budget_idr,
        currency = EXCLUDED.currency, updated_at = NOW()
    `, [request.params.id, month, year, budget_amount || 0, budget_idr || 0, currency || 'USD']);
    return { success: true };
  });
}
