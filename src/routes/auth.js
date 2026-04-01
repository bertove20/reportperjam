/**
 * Auth Routes — Login, change password, me (PostgreSQL)
 */

import { queryOne, query } from '../storage/postgres.js';
import { hashPassword, verifyPassword } from '../utils/auth-utils.js';

export default async function authRoutes(app) {
  app.post('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body || {};
    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password required' });
    }

    const user = await queryOne('SELECT * FROM admin_users WHERE username = $1', [username]);
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' });

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' });

    const token = app.jwt.sign({ id: user.id, username: user.username }, { expiresIn: '7d' });
    return { token, username: user.username };
  });

  app.get('/api/auth/me', async (request) => {
    return { id: request.user.id, username: request.user.username };
  });

  app.post('/api/auth/change-password', async (request, reply) => {
    const { oldPassword, newPassword } = request.body || {};
    if (!oldPassword || !newPassword) return reply.code(400).send({ error: 'Old and new password required' });
    if (newPassword.length < 4) return reply.code(400).send({ error: 'Password minimal 4 karakter' });

    const user = await queryOne('SELECT * FROM admin_users WHERE id = $1', [request.user.id]);
    const valid = await verifyPassword(oldPassword, user.password_hash);
    if (!valid) return reply.code(401).send({ error: 'Old password incorrect' });

    const hash = await hashPassword(newPassword);
    await query('UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, user.id]);

    return { success: true, message: 'Password changed' };
  });
}
