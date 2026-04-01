/**
 * Auth Middleware — JWT + RBAC (Role-Based Access Control)
 *
 * Roles:
 *   superadmin — akses semua module, manage users
 *   leader     — akses module yang diizinkan, manage per divisi
 *   staff      — view only, module yang diizinkan
 */

import { queryRows } from '../storage/postgres.js';

export async function authHook(request, reply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}

/**
 * Register auth hooks pada Fastify instance
 */
export function registerAuth(app) {
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0];

    // Skip auth
    if (path === '/api/auth/login') return;
    if (!path.startsWith('/api/')) return;

    await authHook(request, reply);
  });
}

/**
 * Route-level role check
 * Usage: { preHandler: [requireRole('superadmin')] }
 */
export function requireRole(...roles) {
  return async (request, reply) => {
    if (!roles.includes(request.user.role)) {
      reply.code(403).send({ error: 'Forbidden', message: `Requires role: ${roles.join(' or ')}` });
    }
  };
}

/**
 * Route-level module check
 * Superadmin bypasses. Leader/Staff need permission.
 * Usage: { preHandler: [requireModule('finance')] }
 */
export function requireModule(module) {
  return async (request, reply) => {
    if (request.user.role === 'superadmin') return;

    const perms = await queryRows(
      'SELECT * FROM user_permissions WHERE user_id = $1 AND module = $2',
      [request.user.id, module]
    );

    if (perms.length === 0) {
      reply.code(403).send({ error: 'Forbidden', message: `No access to module: ${module}` });
    }
  };
}

/**
 * Route-level edit check (reject staff from POST/PUT/DELETE)
 * Usage: { preHandler: [requireEdit()] }
 */
export function requireEdit() {
  return async (request, reply) => {
    if (request.user.role === 'superadmin') return;

    if (request.user.role === 'staff') {
      reply.code(403).send({ error: 'Forbidden', message: 'Staff role is read-only' });
    }
  };
}

/**
 * Get user permissions for JWT payload (called at login)
 */
export async function getUserPermissions(userId) {
  return queryRows(
    'SELECT module, can_edit, brand_scope FROM user_permissions WHERE user_id = $1',
    [userId]
  );
}
