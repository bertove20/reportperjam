/**
 * Actions Routes — Manual fetch, report triggers
 */

import { fetchAllBrands, fetchAllBrandsFinish } from '../api/fetch-brand.js';
import { sendTimReports } from '../tim/tim-orchestrator.js';
import { DateTime } from '../utils/datetime.js';
import { logger } from '../logger.js';

export default async function actionRoutes(app) {
  // POST /api/actions/fetch-now
  app.post('/api/actions/fetch-now', async (request) => {
    const { brandKey } = request.body || {};
    const now = DateTime.now();
    const hour = now.hour || 23;
    const dateStr = now.toDateStr();

    logger.info({ hour, brandKey }, 'Manual fetch triggered');

    // Fetch runs in background — respond immediately
    fetchAllBrands(dateStr, hour).catch(err => {
      logger.error({ err: err.message }, 'Manual fetch failed');
    });

    return { success: true, message: `Fetch started for ${brandKey || 'all brands'} at hour ${hour}` };
  });

  // POST /api/actions/report-now
  app.post('/api/actions/report-now', async (request) => {
    const { brandKey } = request.body || {};
    const now = DateTime.now();
    const hour = now.hour || 23;
    const dateStr = now.toDateStr();
    const yesterdayStr = now.yesterday().toDateStr();

    logger.info({ hour, brandKey }, 'Manual report triggered');

    // Report runs in background
    sendTimReports(hour, dateStr, yesterdayStr, brandKey).catch(err => {
      logger.error({ err: err.message }, 'Manual report failed');
    });

    return { success: true, message: `Report started for ${brandKey || 'all brands'} at hour ${hour}` };
  });

  // POST /api/actions/fetch-finish
  app.post('/api/actions/fetch-finish', async (request) => {
    const now = DateTime.now();
    const yesterdayStr = now.yesterday().toDateStr();

    logger.info({ yesterday: yesterdayStr }, 'Manual FINISH fetch triggered');

    fetchAllBrandsFinish(yesterdayStr).catch(err => {
      logger.error({ err: err.message }, 'Manual FINISH fetch failed');
    });

    return { success: true, message: `FINISH fetch started for ${yesterdayStr}` };
  });
}
