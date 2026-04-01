/**
 * Finance Teams — CRUD
 */

import { query, queryRows, queryOne } from '../../storage/postgres.js';
import { requireEdit } from '../../middleware/auth.js';
import { tWhere } from '../../middleware/tenant-scope.js';

export default async function (app) {
  app.get('/api/finance/teams', async (request) => {
    const tid = request.tenantId;
    return queryRows(`
      SELECT t.*, d.name as division_name,
        (SELECT COUNT(*) FROM transactions WHERE team_id = t.id AND tenant_id = $1) as tx_count,
        (SELECT COUNT(*) FROM expense_categories WHERE team_id = t.id AND tenant_id = $1) as category_count
      FROM teams t
      LEFT JOIN divisions d ON t.division_id = d.id
      WHERE t.tenant_id = $1
      ORDER BY d.name, t.name
    `, [tid]);
  });

  app.post('/api/finance/teams', { preHandler: [requireEdit()] }, async (request) => {
    const tid = request.tenantId;
    const { name, description, division_id } = request.body;
    const result = await query(
      'INSERT INTO teams (name, description, division_id, tenant_id) VALUES (UPPER($1), $2, $3, $4) RETURNING *',
      [name, description || null, division_id || null, tid]
    );
    return result.rows[0];
  });

  app.delete('/api/finance/teams/:id', { preHandler: [requireEdit()] }, async (request) => {
    const tid = request.tenantId;
    const txCount = await queryOne('SELECT COUNT(*) as c FROM transactions WHERE team_id = $1 AND tenant_id = $2', [request.params.id, tid]);
    if (parseInt(txCount.c) > 0) return { error: 'Cannot delete team with transactions' };
    await query('DELETE FROM teams WHERE id = $1 AND tenant_id = $2', [request.params.id, tid]);
    return { success: true };
  });

  app.get('/api/finance/teams/by-division/:divisionId', async (request) => {
    const tid = request.tenantId;
    return queryRows('SELECT id, name FROM teams WHERE division_id = $1 AND is_active = 1 AND tenant_id = $2 ORDER BY name', [request.params.divisionId, tid]);
  });
}
