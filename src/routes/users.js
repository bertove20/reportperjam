/**
 * User Management Routes — Superadmin only
 */

import { queryRows, queryOne, query } from '../storage/postgres.js';
import { hashPassword } from '../utils/auth-utils.js';
import { requireRole } from '../middleware/auth.js';

export default async function userRoutes(app) {
  const adminOnly = { preHandler: [requireRole('superadmin')] };

  // GET /api/users
  app.get('/api/users', adminOnly, async () => {
    return queryRows(`
      SELECT u.id, u.username, u.full_name, u.role, u.division_id, u.is_active, u.created_at,
             d.name as division_name
      FROM users u
      LEFT JOIN divisions d ON u.division_id = d.id
      ORDER BY u.id ASC
    `);
  });

  // POST /api/users
  app.post('/api/users', adminOnly, async (request, reply) => {
    const { username, password, full_name, role, division_id, permissions } = request.body || {};
    if (!username || !password) return reply.code(400).send({ error: 'username and password required' });

    const existing = await queryOne('SELECT id FROM users WHERE username = $1', [username]);
    if (existing) return reply.code(409).send({ error: 'Username already exists' });

    const hash = await hashPassword(password);
    const result = await query(
      'INSERT INTO users (username, password_hash, full_name, role, division_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [username, hash, full_name || null, role || 'staff', division_id || null]
    );
    const userId = result.rows[0].id;

    // Set permissions
    if (permissions && Array.isArray(permissions)) {
      for (const perm of permissions) {
        await query(
          'INSERT INTO user_permissions (user_id, module, can_edit, brand_scope) VALUES ($1, $2, $3, $4) ON CONFLICT(user_id, module) DO UPDATE SET can_edit = EXCLUDED.can_edit, brand_scope = EXCLUDED.brand_scope',
          [userId, perm.module, perm.can_edit ? 1 : 0, perm.brand_scope || '*']
        );
      }
    }

    return { success: true, id: userId };
  });

  // PUT /api/users/:id
  app.put('/api/users/:id', adminOnly, async (request, reply) => {
    const { id } = request.params;
    const { full_name, role, division_id, is_active, password, permissions } = request.body || {};

    const fields = [];
    const values = [];
    let idx = 1;

    if (full_name !== undefined) { fields.push(`full_name = $${idx++}`); values.push(full_name); }
    if (role !== undefined) { fields.push(`role = $${idx++}`); values.push(role); }
    if (division_id !== undefined) { fields.push(`division_id = $${idx++}`); values.push(division_id); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
    if (password) { fields.push(`password_hash = $${idx++}`); values.push(await hashPassword(password)); }

    if (fields.length > 0) {
      fields.push('updated_at = NOW()');
      values.push(parseInt(id));
      await query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    }

    // Update permissions
    if (permissions && Array.isArray(permissions)) {
      await query('DELETE FROM user_permissions WHERE user_id = $1', [parseInt(id)]);
      for (const perm of permissions) {
        await query(
          'INSERT INTO user_permissions (user_id, module, can_edit, brand_scope) VALUES ($1, $2, $3, $4)',
          [parseInt(id), perm.module, perm.can_edit ? 1 : 0, perm.brand_scope || '*']
        );
      }
    }

    return { success: true };
  });

  // DELETE /api/users/:id
  app.delete('/api/users/:id', adminOnly, async (request, reply) => {
    const { id } = request.params;
    if (parseInt(id) === request.user.id) {
      return reply.code(400).send({ error: 'Cannot delete yourself' });
    }
    await query('DELETE FROM users WHERE id = $1', [parseInt(id)]);
    return { success: true };
  });

  // ─── Divisions ───

  app.get('/api/divisions', async () => {
    return queryRows('SELECT * FROM divisions ORDER BY name ASC');
  });

  app.post('/api/divisions', adminOnly, async (request) => {
    const { name, description } = request.body || {};
    const result = await query(
      'INSERT INTO divisions (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );
    return result.rows[0];
  });

  app.put('/api/divisions/:id', adminOnly, async (request) => {
    const { name, description, is_active } = request.body || {};
    await query(
      'UPDATE divisions SET name = COALESCE($1, name), description = COALESCE($2, description), is_active = COALESCE($3, is_active), updated_at = NOW() WHERE id = $4',
      [name, description, is_active, request.params.id]
    );
    return { success: true };
  });

  app.delete('/api/divisions/:id', adminOnly, async (request) => {
    await query('DELETE FROM divisions WHERE id = $1', [request.params.id]);
    return { success: true };
  });
}
