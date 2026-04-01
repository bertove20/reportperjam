/**
 * Auth Routes — Login, me, change password (PostgreSQL + RBAC)
 */

import { queryOne, query } from '../storage/postgres.js';
import { hashPassword, verifyPassword } from '../utils/auth-utils.js';
import { getUserPermissions } from '../middleware/auth.js';

export default async function authRoutes(app) {
  app.post('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body || {};
    if (!username || !password) return reply.code(400).send({ error: 'Username and password required' });

    const user = await queryOne('SELECT * FROM users WHERE username = $1 AND is_active = 1', [username]);
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' });

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' });

    const permissions = await getUserPermissions(user.id);

    const token = app.jwt.sign({
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      division_id: user.division_id,
    }, { expiresIn: '7d' });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        division_id: user.division_id,
        permissions,
      },
    };
  });

  app.get('/api/auth/me', async (request) => {
    const permissions = await getUserPermissions(request.user.id);
    const user = await queryOne('SELECT id, username, role, full_name, division_id FROM users WHERE id = $1', [request.user.id]);
    return { ...user, permissions };
  });

  app.post('/api/auth/change-password', async (request, reply) => {
    const { oldPassword, newPassword } = request.body || {};
    if (!oldPassword || !newPassword) return reply.code(400).send({ error: 'Old and new password required' });
    if (newPassword.length < 4) return reply.code(400).send({ error: 'Password minimal 4 karakter' });

    const user = await queryOne('SELECT * FROM users WHERE id = $1', [request.user.id]);
    const valid = await verifyPassword(oldPassword, user.password_hash);
    if (!valid) return reply.code(401).send({ error: 'Old password incorrect' });

    const hash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, user.id]);
    return { success: true };
  });
}
