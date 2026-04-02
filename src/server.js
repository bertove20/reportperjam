/**
 * Server Entry Point — Multi-Tenant SaaS Ecosystem
 */

import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

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
import financeModule from './routes/finance/index.js';
import platformRoutes from './routes/platform.js';
import signupRoutes from './routes/signup.js';
import homeRoutes from './routes/home.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000');
const JWT_SECRET = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || 'dev-secret-change-me';

async function start() {
  // 1. Database
  await initDatabase();
  await initDefaultSettings();
  logger.info('Database ready');

  // 2. Fastify
  const app = Fastify({ logger: false });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });

  // CORS
  await app.register(fastifyCors, { origin: true });

  // JWT
  await app.register(fastifyJwt, { secret: JWT_SECRET });

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error({ err: error.message, url: request.url }, 'Request error');

    if (error.statusCode === 429) {
      return reply.code(429).send({ error: 'Too many requests. Try again later.' });
    }

    reply.code(error.statusCode || 500).send({
      error: error.message || 'Internal server error',
    });
  });

  // Tenant middleware (before auth)
  registerTenantMiddleware(app);

  // Auth middleware
  registerAuth(app);

  // Stricter rate limit on login/signup
  const loginRateLimit = { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } };

  // API Routes
  await app.register(authRoutes);
  await app.register(brandRoutes);
  await app.register(reportRoutes);
  await app.register(settingsRoutes);
  await app.register(monitoringRoutes);
  await app.register(actionRoutes);
  await app.register(userRoutes);
  await app.register(financeModule);
  await app.register(platformRoutes);
  await app.register(signupRoutes);
  await app.register(homeRoutes);

  // Static frontend
  const adminDistPath = join(__dirname, '..', 'admin', 'dist');
  if (existsSync(adminDistPath)) {
    await app.register(fastifyStatic, {
      root: adminDistPath,
      prefix: '/',
      decorateReply: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });
  }

  // SPA fallback
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'API route not found' });
    }
    if (existsSync(adminDistPath)) {
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Frontend not built' });
  });

  // Start
  await app.listen({ port: PORT, host: '0.0.0.0' });
  logger.info({ port: PORT }, `Server running on http://localhost:${PORT}`);

  // 3. Scheduler
  await startScheduler();
  logger.info('Ecosystem SaaS ready');
}

start().catch(err => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
