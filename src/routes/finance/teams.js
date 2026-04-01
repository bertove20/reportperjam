/**
 * Finance Teams — CRUD
 */

import { query, queryRows, queryOne } from '../../storage/postgres.js';
import { requireEdit } from '../../middleware/auth.js';

export default async function (app) {
  app.get('/api/finance/teams', async () => {
    return queryRows(`
      SELECT t.*, d.name as division_name,
        (SELECT COUNT(*) FROM transactions WHERE team_id = t.id) as tx_count,
        (SELECT COUNT(*) FROM expense_categories WHERE team_id = t.id) as category_count
      FROM teams t
      LEFT JOIN divisions d ON t.division_id = d.id
      ORDER BY d.name, t.name
    `);
  });

  app.post('/api/finance/teams', { preHandler: [requireEdit()] }, async (request) => {
    const { name, description, division_id } = request.body;
    const result = await query(
      'INSERT INTO teams (name, description, division_id) VALUES (UPPER($1), $2, $3) RETURNING *',
      [name, description || null, division_id || null]
    );
    return result.rows[0];
  });

  app.delete('/api/finance/teams/:id', { preHandler: [requireEdit()] }, async (request) => {
    const txCount = await queryOne('SELECT COUNT(*) as c FROM transactions WHERE team_id = $1', [request.params.id]);
    if (parseInt(txCount.c) > 0) return { error: 'Cannot delete team with transactions' };
    await query('DELETE FROM teams WHERE id = $1', [request.params.id]);
    return { success: true };
  });

  app.get('/api/finance/teams/by-division/:divisionId', async (request) => {
    return queryRows('SELECT id, name FROM teams WHERE division_id = $1 AND is_active = 1 ORDER BY name', [request.params.divisionId]);
  });
}
