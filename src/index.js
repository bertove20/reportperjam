/**
 * Tim Hourly Report Bot — Entry Point
 * 
 * Cron schedule:
 *   :00 (jam 1-23) → Fetch data dari panel API → simpan SQLite
 *   :05 (jam 1-23) → Baca SQLite → render HTML → screenshot → kirim Telegram
 *   :05 (jam 0)    → Fetch yd* (yesterday final) → simpan hour=24 → kirim FINISH
 */

import cron from 'node-cron';
import { logger } from './logger.js';
import { initDatabase } from './storage/sqlite.js';
import { fetchAllBrands, fetchAllBrandsFinish } from './api/fetch-brand.js';
import { sendTimReports } from './tim/tim-orchestrator.js';
import { DateTime } from './utils/datetime.js';

// ─── Startup ───
logger.info('Tim Hourly Report Bot starting...');
initDatabase();
logger.info('SQLite initialized');

// ─── :00 Fetch (jam 1-23) ───
cron.schedule('0 1-23 * * *', async () => {
  const now = DateTime.now();
  const hour = now.hour;
  const dateStr = now.toDateStr(); // YYYY-MM-DD
  
  logger.info({ hour, date: dateStr }, ':00 fetch starting');
  
  try {
    await fetchAllBrands(dateStr, hour);
    logger.info({ hour }, ':00 fetch complete');
  } catch (err) {
    logger.error({ err, hour }, ':00 fetch failed');
  }
}, { timezone: 'Asia/Phnom_Penh' });

// ─── :05 Report (jam 1-23) ───
cron.schedule('5 1-23 * * *', async () => {
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
}, { timezone: 'Asia/Phnom_Penh' });

// ─── :05 Midnight — FINISH (hour=24) ───
cron.schedule('5 0 * * *', async () => {
  const now = DateTime.now();
  const yesterdayStr = now.yesterday().toDateStr();
  const dayBeforeStr = now.minus(2).toDateStr();
  
  logger.info({ yesterday: yesterdayStr }, '00:05 FINISH starting');
  
  try {
    // Fetch yesterday's final totals → store as hour=24
    await fetchAllBrandsFinish(yesterdayStr);
    
    // Send Tim FINISH photos
    // currentHour=0 signals "show all 24 rows + FINISH"
    await sendTimReports(0, yesterdayStr, dayBeforeStr);
    
    logger.info('00:05 FINISH complete');
  } catch (err) {
    logger.error({ err }, '00:05 FINISH failed');
  }
}, { timezone: 'Asia/Phnom_Penh' });

logger.info('Cron schedules registered. Bot running.');
