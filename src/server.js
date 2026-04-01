/**
 * Server Entry Point — Fastify + Cron Scheduler
 *
 * Menjalankan:
 *   1. SQLite init (semua tabel)
 *   2. Fastify HTTP server (API + static frontend)
 *   3. Cron scheduler (fetch + report)
 */

import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

import { initDatabase } from './storage/postgres.js';
import { initDefaultSettings } from './storage/settings-store.js';
import { registerAuth } from './middleware/auth.js';
import { startScheduler } from './scheduler.js';
import { logger } from './logger.js';

// Route imports
import authRoutes from './routes/auth.js';
import brandRoutes from './routes/brands.js';
import reportRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import monitoringRoutes from './routes/monitoring.js';
import actionRoutes from './routes/actions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000');
const JWT_SECRET = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY || 'dev-secret-change-me';

async function start() {
  // 1. Database
  await initDatabase();
  await initDefaultSettings();
  logger.info('Database ready');

  // 2. Fastify
  const app = Fastify({
    logger: false, // kita pakai pino sendiri
  });

  // Plugins
  await app.register(fastifyCors, {
    origin: true, // Allow all origins in dev
  });

  await app.register(fastifyJwt, {
    secret: JWT_SECRET,
  });

  // Auth middleware
  registerAuth(app);

  // API Routes
  await app.register(authRoutes);
  await app.register(brandRoutes);
  await app.register(reportRoutes);
  await app.register(settingsRoutes);
  await app.register(monitoringRoutes);
  await app.register(actionRoutes);

  // Static frontend (admin/dist)
  const adminDistPath = join(__dirname, '..', 'admin', 'dist');
  if (existsSync(adminDistPath)) {
    await app.register(fastifyStatic, {
      root: adminDistPath,
      prefix: '/',
      wildcard: false, // Don't catch all routes
    });
  }

  // SPA fallback: non-API, non-static routes → index.html
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'API route not found' });
    }
    if (existsSync(adminDistPath)) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Frontend not built yet. Run: cd admin && npm run build' });
  });

  // Start server
  await app.listen({ port: PORT, host: '0.0.0.0' });
  logger.info({ port: PORT }, `Fastify server running on http://localhost:${PORT}`);

  // 3. Scheduler
  await startScheduler();
  logger.info('Tim Report Bot SaaS ready');
}

start().catch(err => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
