/**
 * Monitoring Routes — Status, logs
 */

import { queryLogs, getLogStats, getLatestLog } from '../storage/log-store.js';
import { getAllBrands } from '../storage/brand-store.js';

const startTime = Date.now();

export default async function monitoringRoutes(app) {
  // GET /api/status
  app.get('/api/status', async () => {
    const brands = getAllBrands(true);
    const stats = getLogStats();

    const brandStatus = brands.map(b => {
      const lastFetch = getLatestLog(b.key, 'fetch');
      const lastSend = getLatestLog(b.key, 'send');
      return {
        key: b.key,
        name: b.name,
        engine: b.engine,
        is_active: b.is_active,
        lastFetch: lastFetch ? { status: lastFetch.status, at: lastFetch.created_at, message: lastFetch.message } : null,
        lastSend: lastSend ? { status: lastSend.status, at: lastSend.created_at } : null,
      };
    });

    return {
      uptime: Math.round((Date.now() - startTime) / 1000),
      uptimeFormatted: formatUptime(Date.now() - startTime),
      brands: brandStatus,
      stats,
    };
  });

  // GET /api/logs?type=fetch&brand=BRAND_E&status=error&limit=50&offset=0
  app.get('/api/logs', async (request) => {
    const { type, brand, status, limit, offset } = request.query;
    return queryLogs({
      type,
      brand,
      status,
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
