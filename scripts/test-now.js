/**
 * Test Manual — Fetch + Kirim Report untuk BRAND_E (panen77) saja
 *
 * Usage: node --env-file=.env scripts/test-now.js
 */

import { initDatabase } from '../src/storage/postgres.js';
import { fetchAsia77Daily, fetchAsia77Regis } from '../src/api/asia77-engine.js';
import { upsertSnapshot, getSnapshots } from '../src/storage/postgres.js';
import { getTimBrandData } from '../src/tim/tim-data.js';
import { buildTimHtml } from '../src/tim/tim-html.js';
import { renderPng } from '../src/tim/tim-renderer.js';
import { sendPhoto } from '../src/tim/tim-sender.js';
import { DateTime } from '../src/utils/datetime.js';
import { BRANDS } from '../src/tim/brand-configs.js';
import { logger } from '../src/logger.js';

async function main() {
  // 1. Init database
  initDatabase();

  const now = DateTime.now();
  const hour = now.hour;
  if (!hour || hour === 0) {
    logger.error('Hour is 0 (midnight) — use fetchAllBrandsFinish instead');
    process.exit(1);
  }
  const dateStr = now.toDateStr();
  const yesterdayStr = now.yesterday().toDateStr();

  const brand = BRANDS.find(b => b.key === 'BRAND_E');
  if (!brand) {
    logger.error('BRAND_E not found in config!');
    process.exit(1);
  }

  logger.info({ hour, date: dateStr, brand: brand.name }, '=== TEST START ===');

  // 2. Fetch data dari panel asia77cash.com
  try {
    logger.info('Fetching daily data...');
    const daily = await fetchAsia77Daily(brand.key, brand.domain);
    const trx = daily.dpapp || 0;
    logger.info({ trx }, 'TRX (approved deposits) received');

    logger.info('Fetching regis data...');
    const dateDDMMYYYY = now.toDDMMYYYY();
    const regis = await fetchAsia77Regis(brand.key, brand.domain, dateDDMMYYYY, brand.userId);
    logger.info({ regis }, 'REGIS (registrations) received');

    // Simpan ke SQLite
    upsertSnapshot(brand.key, dateStr, hour, trx, regis);
    logger.info({ trx, regis, hour }, 'Data saved to SQLite');
  } catch (err) {
    logger.error({ err: err.message }, 'Fetch FAILED — check cookie/domain');
    process.exit(1);
  }

  // 3. Render report HTML → PNG → kirim Telegram
  try {
    const data = getTimBrandData(brand.key, dateStr, yesterdayStr, hour);
    const html = buildTimHtml(brand, data, dateStr, hour);
    const png = await renderPng(html);

    const hourLabel = `${String(hour).padStart(2, '0')}:00`;
    const caption = `📊 ${brand.name} │ ${hourLabel} WIB │ ${dateStr}`;

    const groupId = process.env.TG_REPORT_GROUP;
    await sendPhoto(groupId, png, caption);
    logger.info('=== TEST: Report sent to Telegram! ===');
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'Report render/send FAILED');
  }

  logger.info('=== TEST DONE ===');
  process.exit(0);
}

main();
