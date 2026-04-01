/**
 * Finance Categories — CRUD
 */

import { query, queryRows, queryOne } from '../../storage/postgres.js';
import { requireEdit } from '../../middleware/auth.js';
import { tWhere } from '../../middleware/tenant-scope.js';

export default async function (app) {
  app.get('/api/finance/categories', async (request) => {
    const tid = request.tenantId;
    return queryRows(`
      SELECT ec.*, tm.name as team_name,
        (SELECT COUNT(*) FROM transactions WHERE category_id = ec.id AND tenant_id = $1) as tx_count
      FROM expense_categories ec
      LEFT JOIN teams tm ON ec.team_id = tm.id
      WHERE ec.tenant_id = $1
      ORDER BY tm.name, ec.name
    `, [tid]);
  });

  app.post('/api/finance/categories', { preHandler: [requireEdit()] }, async (request) => {
    const tid = request.tenantId;
    const { name, description, team_id } = request.body;
    const result = await query(
      'INSERT INTO expense_categories (name, description, team_id, tenant_id) VALUES (UPPER($1), $2, $3, $4) RETURNING *',
      [name, description || null, team_id || null, tid]
    );
    return result.rows[0];
  });

  app.delete('/api/finance/categories/:id', { preHandler: [requireEdit()] }, async (request) => {
    const tid = request.tenantId;
    const txCount = await queryOne('SELECT COUNT(*) as c FROM transactions WHERE category_id = $1 AND tenant_id = $2', [request.params.id, tid]);
    if (parseInt(txCount.c) > 0) return { error: 'Cannot delete category with transactions' };
    await query('DELETE FROM expense_categories WHERE id = $1 AND tenant_id = $2', [request.params.id, tid]);
    return { success: true };
  });

  // API: categories by team
  app.get('/api/finance/categories/by-team/:teamId', async (request) => {
    const tid = request.tenantId;
    return queryRows('SELECT id, name FROM expense_categories WHERE team_id = $1 AND is_active = 1 AND tenant_id = $2 ORDER BY name', [request.params.teamId, tid]);
  });
}
