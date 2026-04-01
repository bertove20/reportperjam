/**
 * Unified Fetch Layer
 *
 * Routes ke engine yang benar berdasarkan brand config.
 * Brands dibaca dari database (via getBrands()).
 */

import { fetchAsia77Daily, fetchAsia77Regis } from './asia77-engine.js';
import { fetchSyntechDaily, fetchSyntechRegis } from './syntech-engine.js';
import { upsertSnapshot } from '../storage/postgres.js';
import { getBrands } from '../tim/brand-configs.js';
import { insertLog } from '../storage/log-store.js';
import { sendFetchErrorAlert } from '../tim/tim-alert.js';
import { DateTime } from '../utils/datetime.js';
import { logger } from '../logger.js';

async function withRetry(fn, label, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      logger.warn({ attempt, label, err: err.message }, 'Fetch failed, retrying...');
      if (attempt < retries) await new Promise(r => setTimeout(r, 10000));
      else throw err;
    }
  }
}

/**
 * Fetch semua brand untuk jam biasa (hours 1-23)
 */
export async function fetchAllBrands(dateStr, hour) {
  const dt = new DateTime();
  const brands = await getBrands();
  const errors = [];

  for (const brand of brands) {
    const start = Date.now();
    try {
      let trx = 0;
      let regis = 0;

      if (brand.engine === 'asia77') {
        const daily = await withRetry(
          () => fetchAsia77Daily(brand.key, brand.domain, brand.cookieHeader),
          `${brand.key} daily`
        );
        trx = daily.dpapp || 0;

        const dateDDMMYYYY = dt.toDDMMYYYY();
        regis = await withRetry(
          () => fetchAsia77Regis(brand.key, brand.domain, dateDDMMYYYY, brand.userId, brand.cookieHeader),
          `${brand.key} regis`
        );

      } else if (brand.engine === 'syntech') {
        const dateISO = `${dateStr}T${String(hour).padStart(2, '0')}:00:00+07:00`;
        const config = { domain: brand.domain, user: brand.user, pass: brand.pass, pin: brand.pin };

        const daily = await withRetry(
          () => fetchSyntechDaily(config, dateISO),
          `${brand.key} daily`
        );
        trx = daily.deposit_action_accepted_count || 0;

        const startISO = `${dateStr}T00:00:00+07:00`;
        const endISO = `${dateStr}T23:59:59+07:00`;
        regis = await withRetry(
          () => fetchSyntechRegis(config, startISO, endISO),
          `${brand.key} regis`
        );
      }

      await upsertSnapshot(brand.key, dateStr, hour, trx, regis);
      const duration = Date.now() - start;
      logger.info({ brand: brand.key, hour, trx, regis }, 'Data stored');
      insertLog('fetch', brand.key, 'success', `trx=${trx} regis=${regis}`, duration);

    } catch (err) {
      const duration = Date.now() - start;
      logger.error({ brand: brand.key, hour, err: err.message }, 'Brand fetch failed');
      insertLog('fetch', brand.key, 'error', err.message, duration);
      errors.push({ brand: brand.name || brand.key, error: err.message });
    }
  }

  // Kirim alert ke Telegram jika ada error
  if (errors.length > 0) {
    sendFetchErrorAlert(errors, hour).catch(e => logger.error({ err: e.message }, 'Alert send failed'));
  }
}

/**
 * Fetch FINISH (hour=24) untuk semua brand
 */
export async function fetchAllBrandsFinish(yesterdayDateStr) {
  const brands = await getBrands();

  for (const brand of brands) {
    const start = Date.now();
    try {
      let trx = 0;
      let regis = 0;

      if (brand.engine === 'asia77') {
        const daily = await withRetry(
          () => fetchAsia77Daily(brand.key, brand.domain, brand.cookieHeader),
          `${brand.key} finish`
        );
        trx = daily.yddpapp || 0;

        // REGIS: pakai /memberlist (bukan ydmmb yang angkanya salah)
        const [y, m, d] = yesterdayDateStr.split('-');
        const ddmmyyyy = `${d}-${m}-${y}`;
        regis = await withRetry(
          () => fetchAsia77Regis(brand.key, brand.domain, ddmmyyyy, brand.userId, brand.cookieHeader),
          `${brand.key} finish regis`
        );

      } else if (brand.engine === 'syntech') {
        const config = { domain: brand.domain, user: brand.user, pass: brand.pass, pin: brand.pin };
        const dateISO = `${yesterdayDateStr}T23:59:59+07:00`;

        const daily = await withRetry(
          () => fetchSyntechDaily(config, dateISO),
          `${brand.key} finish`
        );
        trx = daily.deposit_action_accepted_count || 0;

        const startISO = `${yesterdayDateStr}T00:00:00+07:00`;
        const endISO = `${yesterdayDateStr}T23:59:59+07:00`;
        regis = await withRetry(
          () => fetchSyntechRegis(config, startISO, endISO),
          `${brand.key} finish regis`
        );
      }

      await upsertSnapshot(brand.key, yesterdayDateStr, 24, trx, regis);
      const duration = Date.now() - start;
      logger.info({ brand: brand.key, trx, regis }, 'FINISH stored');
      insertLog('finish', brand.key, 'success', `trx=${trx} regis=${regis}`, duration);

    } catch (err) {
      const duration = Date.now() - start;
      logger.error({ brand: brand.key, err: err.message }, 'FINISH fetch failed');
      insertLog('finish', brand.key, 'error', err.message, duration);
    }
  }
}
