/**
 * Auth Middleware — JWT verification untuk Fastify
 */

export async function authHook(request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}

/**
 * Register auth decorator pada Fastify instance
 */
export function registerAuth(app) {
  // Protect all /api/* routes kecuali login
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url;

    // Skip auth untuk:
    if (path === '/api/auth/login') return;
    if (!path.startsWith('/api/')) return;   // static files, frontend

    await authHook(request, reply);
  });
}
