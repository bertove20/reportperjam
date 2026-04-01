/**
 * Finance Categories — CRUD
 */

import { query, queryRows, queryOne } from '../../storage/postgres.js';
import { requireEdit } from '../../middleware/auth.js';

export default async function (app) {
  app.get('/api/finance/categories', async () => {
    return queryRows(`
      SELECT ec.*, tm.name as team_name,
        (SELECT COUNT(*) FROM transactions WHERE category_id = ec.id) as tx_count
      FROM expense_categories ec
      LEFT JOIN teams tm ON ec.team_id = tm.id
      ORDER BY tm.name, ec.name
    `);
  });

  app.post('/api/finance/categories', { preHandler: [requireEdit()] }, async (request) => {
    const { name, description, team_id } = request.body;
    const result = await query(
      'INSERT INTO expense_categories (name, description, team_id) VALUES (UPPER($1), $2, $3) RETURNING *',
      [name, description || null, team_id || null]
    );
    return result.rows[0];
  });

  app.delete('/api/finance/categories/:id', { preHandler: [requireEdit()] }, async (request) => {
    const txCount = await queryOne('SELECT COUNT(*) as c FROM transactions WHERE category_id = $1', [request.params.id]);
    if (parseInt(txCount.c) > 0) return { error: 'Cannot delete category with transactions' };
    await query('DELETE FROM expense_categories WHERE id = $1', [request.params.id]);
    return { success: true };
  });

  // API: categories by team
  app.get('/api/finance/categories/by-team/:teamId', async (request) => {
    return queryRows('SELECT id, name FROM expense_categories WHERE team_id = $1 AND is_active = 1 ORDER BY name', [request.params.teamId]);
  });
}
