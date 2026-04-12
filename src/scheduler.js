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
import { cleanLogsBeforeCurrentMonth } from './storage/log-store.js';
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

  // ─── :03 Refresh + Fetch + Recovery + Report (jam 1-23) ───
  // Pipeline lengkap: refresh session → fetch fresh → isi jam kosong → render → kirim.
  // Angka di report = data yang BARU SAJA di-fetch (~detik sebelum render).
  // Dijalankan di :03 supaya panel punya waktu 3 menit setelah pergantian jam
  // untuk finalize angka kumulatifnya.
  jobs.push(cron.schedule('3 1-23 * * *', async () => {
    const tenants = await getActiveTenants();
    for (const tenant of tenants) {
      try {
        const now = DateTime.now();
        const hour = now.hour;
        const dateStr = now.toDateStr();

        // 0. Pre-fetch refresh: ping panel asia77 supaya server-side cache
        //    di-invalidate dan fetch berikutnya return data paling fresh.
        //    Syntech tidak perlu (stateless JWT, tidak ada server-side cache).
        const brands = await getBrands(tenant.id);
        for (const brand of brands.filter(b => b.engine === 'asia77')) {
          await keepaliveAsia77(brand.key, brand.domain, brand.cookieHeader, brand.userId);
        }

        // 1. Fetch fresh dari panel → simpan ke DB
        logger.info({ tenant: tenant.slug, hour }, 'Fetch starting');
        await fetchAllBrands(dateStr, hour, tenant.id);

        // 2. Auto-recovery: isi jam kosong sebelum report supaya laporan lengkap
        await recoverMissingHours(dateStr, hour, tenant.id);

        // 3. Render + kirim report (data yang baru saja di-fetch)
        await sendTimReports(hour, dateStr, now.yesterday().toDateStr(), null, tenant.id);
      } catch (err) {
        logger.error({ tenant: tenant.slug, err: err.message }, 'Tenant fetch+report failed');
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

  // ─── Monthly cleanup: tanggal 1 jam 00:30, hapus semua log dari bulan lalu & sebelumnya ───
  // Waktu 00:30 dipilih supaya dijalankan setelah cron FINISH (00:05)
  // selesai dan sebelum fetch hourly (01:00) mulai.
  jobs.push(cron.schedule('30 0 1 * *', async () => {
    try {
      const deleted = await cleanLogsBeforeCurrentMonth();
      logger.info({ deleted }, 'Monthly log cleanup: logs from previous months deleted');
    } catch (err) {
      logger.error({ err: err.message }, 'Monthly log cleanup failed');
    }
  }, { timezone: defaultTz }));

  logger.info('Multi-tenant scheduler started');
}

export function stopScheduler() {
  for (const job of jobs) job.stop();
  jobs.length = 0;
}
