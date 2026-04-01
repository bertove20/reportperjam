/**
 * Monitoring Routes — Status, logs (PostgreSQL)
 */

import { queryLogs, getLogStats, getLatestLog } from '../storage/log-store.js';
import { getAllBrands } from '../storage/brand-store.js';
import { queryAuditLogs } from '../storage/audit-store.js';

const startTime = Date.now();

export default async function monitoringRoutes(app) {
  app.get('/api/status', async () => {
    const brands = await getAllBrands(true);
    const stats = await getLogStats();

    const brandStatus = [];
    for (const b of brands) {
      const lastFetch = await getLatestLog(b.key, 'fetch');
      const lastSend = await getLatestLog(b.key, 'send');
      brandStatus.push({
        key: b.key, name: b.name, engine: b.engine, is_active: b.is_active,
        lastFetch: lastFetch ? { status: lastFetch.status, at: lastFetch.created_at, message: lastFetch.message } : null,
        lastSend: lastSend ? { status: lastSend.status, at: lastSend.created_at } : null,
      });
    }

    return {
      uptime: Math.round((Date.now() - startTime) / 1000),
      uptimeFormatted: formatUptime(Date.now() - startTime),
      brands: brandStatus,
      stats,
    };
  });

  // GET /api/audit-logs
  app.get('/api/audit-logs', async (request) => {
    const tid = request.tenantId;
    const { module, action, limit, offset } = request.query;
    const logs = await queryAuditLogs({
      tenantId: tid,
      module, action,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
    });
    return logs;
  });

  app.get('/api/logs', async (request) => {
    const { type, brand, status, limit, offset } = request.query;
    return queryLogs({
      type, brand, status,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
    });
  });
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}
