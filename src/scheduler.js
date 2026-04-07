/**
 * Scheduler — Multi-tenant cron jobs
 *
 * Iterates over all active tenants and runs fetch/report for each.
 */

import cron from 'node-cron';
import { queryRows } from './storage/postgres.js';
import { getSetting } from './storage/settings-store.js';
import { fetchAllBrands, fetchAllBrandsFinish, recoverMissingHours } from './api/fetch-brand.js';
import { sendTimReports } from './tim/tim-orchestrator.js';
import { sendReferralReports } from './tim/referral-report-orchestrator.js';
import { cleanOldLogs } from './storage/log-store.js';
import { keepaliveAsia77 } from './api/asia77-engine.js';
import { getBrands } from './tim/brand-configs.js';
import { DateTime } from './utils/datetime.js';
import { logger } from './logger.js';

const jobs = [];

async function getActiveTenants() {
  return queryRows('SELECT id, name, slug FROM tenants WHERE is_active = 1');
}

export async function startScheduler() {
  // Use default timezone, individual tenants can override
  const defaultTz = process.env.TZ || 'Asia/Phnom_Penh';

  // ─── :00 Fetch (jam 1-23) — iterate all tenants ───
  jobs.push(cron.schedule('0 1-23 * * *', async () => {
    const tenants = await getActiveTenants();
    for (const tenant of tenants) {
      try {
        const tz = await getSetting('timezone', 'report', tenant.id) || defaultTz;
        const now = DateTime.now();
        const hour = now.hour;
        const dateStr = now.toDateStr();

        logger.info({ tenant: tenant.slug, hour }, 'Fetch starting');
        await fetchAllBrands(dateStr, hour, tenant.id);
      } catch (err) {
        logger.error({ tenant: tenant.slug, err: err.message }, 'Tenant fetch failed');
      }
    }
  }, { timezone: defaultTz }));

  // ─── :05 Recovery + Report (jam 1-23) ───
  jobs.push(cron.schedule('5 1-23 * * *', async () => {
    const tenants = await getActiveTenants();
    for (const tenant of tenants) {
      try {
        const now = DateTime.now();

        // Auto-recovery: isi jam kosong sebelum report supaya laporan lengkap
        await recoverMissingHours(now.toDateStr(), now.hour, tenant.id);

        await sendTimReports(now.hour, now.toDateStr(), now.yesterday().toDateStr(), null, tenant.id);
      } catch (err) {
        logger.error({ tenant: tenant.slug, err: err.message }, 'Tenant report failed');
      }
    }
  }, { timezone: defaultTz }));

  // ─── 00:05 FINISH ───
  jobs.push(cron.schedule('5 0 * * *', async () => {
    const tenants = await getActiveTenants();
    for (const tenant of tenants) {
      try {
        const now = DateTime.now();
        const yesterdayStr = now.yesterday().toDateStr();
        const dayBeforeStr = now.minus(2).toDateStr();

        await fetchAllBrandsFinish(yesterdayStr, tenant.id);
        await sendTimReports(0, yesterdayStr, dayBeforeStr, null, tenant.id);

        // Referral report harian per divisi — kirim untuk data kemarin
        try {
          await sendReferralReports(yesterdayStr, tenant.id);
        } catch (err) {
          logger.error({ tenant: tenant.slug, err: err.message }, 'Referral report failed');
        }
      } catch (err) {
        logger.error({ tenant: tenant.slug, err: err.message }, 'Tenant FINISH failed');
      }
    }
  }, { timezone: defaultTz }));

  // ─── Keepalive: every 10 min (lebih sering dari 15 untuk safety margin) ───
  const keepaliveFailCounts = new Map(); // brandKey → consecutive fail count
  jobs.push(cron.schedule('*/10 * * * *', async () => {
    const tenants = await getActiveTenants();
    for (const tenant of tenants) {
      const brands = (await getBrands(tenant.id)).filter(b => b.engine === 'asia77');
      const failedBrands = [];

      for (const brand of brands) {
        const result = await keepaliveAsia77(brand.key, brand.domain, brand.cookieHeader, brand.userId);
        const key = brand.key;

        if (result.ok) {
          keepaliveFailCounts.set(key, 0);
        } else {
          const count = (keepaliveFailCounts.get(key) || 0) + 1;
          keepaliveFailCounts.set(key, count);
          logger.warn({ brand: key, error: result.error, consecutiveFails: count }, 'Keepalive failed');

          // Alert setelah 3x berturut-turut gagal (30 menit)
          if (count === 3) {
            failedBrands.push({ brand: brand.name || key, error: result.error });
          }
        }
      }

      // Kirim alert kalau ada brand yang gagal 3x berturut-turut
      if (failedBrands.length > 0) {
        const { sendAlert } = await import('./tim/tim-alert.js');
        const lines = [
          '⚠️ <b>KEEPALIVE FAILED — Cookie mungkin expired</b>',
          '',
          ...failedBrands.map(f => `❌ <b>${f.brand}</b>: ${f.error}`),
          '',
          '💡 Login ulang via Admin → Brands → Edit → paste cookie baru',
        ];
        sendAlert(lines.join('\n'), tenant.id).catch(() => {});
      }
    }
  }, { timezone: defaultTz }));

  // ─── Weekly cleanup: setiap Senin jam 03:00, hapus log > 7 hari ───
  jobs.push(cron.schedule('0 3 * * 1', async () => {
    const deleted = await cleanOldLogs(7);
    if (deleted > 0) logger.info({ deleted }, 'Weekly log cleanup: old logs deleted');
  }, { timezone: defaultTz }));

  logger.info('Multi-tenant scheduler started');
}

export function stopScheduler() {
  for (const job of jobs) job.stop();
  jobs.length = 0;
}
