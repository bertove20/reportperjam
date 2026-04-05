/**
 * Server Entry Point — Multi-Tenant SaaS Ecosystem
 *
 * Fastify: hanya API (port 3000)
 * Nginx: serve static frontend + proxy /api → Fastify
 */

import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { initDatabase } from './storage/postgres.js';
import { initDefaultSettings } from './storage/settings-store.js';
import { registerAuth } from './middleware/auth.js';
import { registerTenantMiddleware } from './middleware/tenant.js';
import { startScheduler } from './scheduler.js';
import { logger } from './logger.js';

// Route imports
import authRoutes from './routes/auth.js';
import brandRoutes from './routes/brands.js';
import reportRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import monitoringRoutes from './routes/monitoring.js';
import actionRoutes from './routes/actions.js';
import userRoutes from './routes/users.js';
import referralRoutes from './routes/referrals.js';
import financeModule from './routes/finance/index.js';
import platformRoutes from './routes/platform.js';
import signupRoutes from './routes/signup.js';
import homeRoutes from './routes/home.js';

const PORT = parseInt(process.env.PORT || '3000');
const JWT_SECRET = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || 'dev-secret-change-me';

async function start() {
  // 1. Database
  await initDatabase();
  await initDefaultSettings();
  logger.info('Database ready');

  // 2. Fastify — API only
  const app = Fastify({ logger: false });

  await app.register(rateLimit, { max: 100, timeWindow: '1 minute', keyGenerator: (r) => r.ip });
  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyJwt, { secret: JWT_SECRET });

  app.setErrorHandler((error, request, reply) => {
    logger.error({ err: error.message, url: request.url }, 'Request error');
    if (error.statusCode === 429) return reply.code(429).send({ error: 'Too many requests' });
    reply.code(error.statusCode || 500).send({ error: error.message || 'Internal server error' });
  });

  registerTenantMiddleware(app);
  registerAuth(app);

  // API Routes
  await app.register(authRoutes);
  await app.register(brandRoutes);
  await app.register(reportRoutes);
  await app.register(settingsRoutes);
  await app.register(monitoringRoutes);
  await app.register(actionRoutes);
  await app.register(userRoutes);
  await app.register(referralRoutes);
  await app.register(financeModule);
  await app.register(platformRoutes);
  await app.register(signupRoutes);
  await app.register(homeRoutes);

  // Health check
  app.get('/api/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  // Start
  await app.listen({ port: PORT, host: '0.0.0.0' });
  logger.info({ port: PORT }, `API server running on http://localhost:${PORT}`);

  // 3. Scheduler
  await startScheduler();
  logger.info('Ecosystem SaaS ready');
}

start().catch(err => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
