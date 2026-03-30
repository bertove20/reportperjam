/**
 * Auth Routes — Login, change password, me
 */

import { getDb } from '../storage/sqlite.js';
import { hashPassword, verifyPassword } from '../utils/auth-utils.js';

export default async function authRoutes(app) {
  // POST /api/auth/login
  app.post('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body || {};
    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password required' });
    }

    const user = getDb().prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign({ id: user.id, username: user.username }, { expiresIn: '7d' });
    return { token, username: user.username };
  });

  // GET /api/auth/me
  app.get('/api/auth/me', async (request) => {
    return { id: request.user.id, username: request.user.username };
  });

  // POST /api/auth/change-password
  app.post('/api/auth/change-password', async (request, reply) => {
    const { oldPassword, newPassword } = request.body || {};
    if (!oldPassword || !newPassword) {
      return reply.code(400).send({ error: 'Old and new password required' });
    }
    if (newPassword.length < 4) {
      return reply.code(400).send({ error: 'Password minimal 4 karakter' });
    }

    const user = getDb().prepare('SELECT * FROM admin_users WHERE id = ?').get(request.user.id);
    const valid = await verifyPassword(oldPassword, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Old password incorrect' });
    }

    const hash = await hashPassword(newPassword);
    getDb().prepare("UPDATE admin_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .run(hash, user.id);

    return { success: true, message: 'Password changed' };
  });
}
