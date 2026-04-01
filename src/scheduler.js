/**
 * Scheduler — Cron jobs untuk fetch data dan kirim report
 *
 * Membaca jadwal dari database settings.
 * Extracted dari index.js supaya bisa dipakai oleh server.js.
 */

import cron from 'node-cron';
import { getSetting } from './storage/settings-store.js';
import { fetchAllBrands, fetchAllBrandsFinish } from './api/fetch-brand.js';
import { sendTimReports } from './tim/tim-orchestrator.js';
import { cleanOldLogs } from './storage/log-store.js';
import { keepaliveAsia77 } from './api/asia77-engine.js';
import { getBrands } from './tim/brand-configs.js';
import { DateTime } from './utils/datetime.js';
import { logger } from './logger.js';

const jobs = [];

export function startScheduler() {
  const timezone = getSetting('timezone') || process.env.TZ || 'Asia/Phnom_Penh';
  const cronFetch = getSetting('cron_fetch') || '0 1-23 * * *';
  const cronReport = getSetting('cron_report') || '5 1-23 * * *';
  const cronFinish = getSetting('cron_finish') || '5 0 * * *';

  // ─── :00 Fetch (jam 1-23) ───
  jobs.push(cron.schedule(cronFetch, async () => {
    const now = DateTime.now();
    const hour = now.hour;
    const dateStr = now.toDateStr();

    logger.info({ hour, date: dateStr }, ':00 fetch starting');
    try {
      await fetchAllBrands(dateStr, hour);
      logger.info({ hour }, ':00 fetch complete');
    } catch (err) {
      logger.error({ err, hour }, ':00 fetch failed');
    }
  }, { timezone }));

  // ─── :05 Report (jam 1-23) ───
  jobs.push(cron.schedule(cronReport, async () => {
    const now = DateTime.now();
    const hour = now.hour;
    const dateStr = now.toDateStr();
    const yesterdayStr = now.yesterday().toDateStr();

    logger.info({ hour, date: dateStr }, ':05 report starting');
    try {
      await sendTimReports(hour, dateStr, yesterdayStr);
      logger.info({ hour }, ':05 report complete');
    } catch (err) {
      logger.error({ err, hour }, ':05 report failed');
    }
  }, { timezone }));

  // ─── :05 Midnight — FINISH (hour=24) ───
  jobs.push(cron.schedule(cronFinish, async () => {
    const now = DateTime.now();
    const yesterdayStr = now.yesterday().toDateStr();
    const dayBeforeStr = now.minus(2).toDateStr();

    logger.info({ yesterday: yesterdayStr }, '00:05 FINISH starting');
    try {
      await fetchAllBrandsFinish(yesterdayStr);
      await sendTimReports(0, yesterdayStr, dayBeforeStr);
      logger.info('00:05 FINISH complete');
    } catch (err) {
      logger.error({ err }, '00:05 FINISH failed');
    }
  }, { timezone }));

  // ─── Keepalive: setiap 15 menit, hit /clearMessage supaya session tidak expire ───
  jobs.push(cron.schedule('*/15 * * * *', async () => {
    const brands = getBrands().filter(b => b.engine === 'asia77');
    for (const brand of brands) {
      const ok = await keepaliveAsia77(brand.key, brand.domain, brand.cookieHeader);
      if (!ok) logger.warn({ brand: brand.key }, 'Keepalive failed');
    }
  }, { timezone }));

  // ─── Daily cleanup: hapus logs > 30 hari ───
  jobs.push(cron.schedule('0 3 * * *', () => {
    const deleted = cleanOldLogs(30);
    if (deleted > 0) logger.info({ deleted }, 'Old logs cleaned');
  }, { timezone }));

  logger.info({ timezone, cronFetch, cronReport, cronFinish }, 'Scheduler started');
}

export function stopScheduler() {
  for (const job of jobs) {
    job.stop();
  }
  jobs.length = 0;
  logger.info('Scheduler stopped');
}
