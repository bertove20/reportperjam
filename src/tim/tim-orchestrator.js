/**
 * Tim Report Orchestrator
 *
 * Koordinasi: query data → generate HTML → screenshot → kirim Telegram
 * Brands dibaca dari database (async).
 */

import { getBrands } from './brand-configs.js';
import { getTimBrandData } from './tim-data.js';
import { buildTimHtml } from './tim-html.js';
import { renderPng } from './tim-renderer.js';
import { sendPhoto } from './tim-sender.js';
import { insertLog } from '../storage/log-store.js';
import { getSetting } from '../storage/settings-store.js';
import { logger } from '../logger.js';

const DELAY_BETWEEN_BRANDS = 3000;

/**
 * Kirim Tim report untuk semua brand (atau satu brand spesifik)
 */
export async function sendTimReports(currentHour, todayDate, yesterdayDate, brandKey = null, tenantId = null) {
  const groupId = await getSetting('tg_report_group', 'report', tenantId) || process.env.TG_REPORT_GROUP;
  if (!groupId) {
    logger.warn('TG_REPORT_GROUP not set — skipping Tim reports');
    return;
  }

  const allBrands = await getBrands(tenantId);
  const brands = brandKey ? allBrands.filter(b => b.key === brandKey) : allBrands;
  let successCount = 0;

  for (const brand of brands) {
    const start = Date.now();
    try {
      const data = await getTimBrandData(brand.key, todayDate, yesterdayDate, currentHour);
      const html = buildTimHtml(brand, data, todayDate, currentHour);
      const png = await renderPng(html);

      const hourLabel = currentHour === 0 ? 'FINISH' : `${String(currentHour).padStart(2, '0')}:00`;
      const caption = `📊 ${brand.name} │ ${hourLabel} WIB │ ${todayDate}`;

      await sendPhoto(groupId, png, caption, tenantId);
      successCount++;

      const duration = Date.now() - start;
      logger.info({ brand: brand.key, hour: currentHour }, 'Tim report sent');
      await insertLog('send', brand.key, 'success', `${hourLabel}`, duration);

      if (brands.indexOf(brand) < brands.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_BRANDS));
      }

    } catch (err) {
      const duration = Date.now() - start;
      logger.error({ brand: brand.key, err: err.message }, 'Tim report failed for brand');
      await insertLog('send', brand.key, 'error', err.message, duration);
    }
  }

  logger.info({ successCount, total: brands.length }, 'Tim report cycle complete');
}
