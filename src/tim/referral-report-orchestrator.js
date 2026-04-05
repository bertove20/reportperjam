/**
 * Referral Report Orchestrator — daily finish (00:05 WIB)
 *
 * Alur:
 *   1. Ambil divisi + referral codes aktif untuk tenant ini
 *   2. Per divisi → per brand → fetch member list dua kali:
 *        a) newmb=true  → jumlah regis baru per referral
 *        b) newmb=false → jumlah non-new member yang muncul di range (deposit aktif)
 *   3. Agregasi per referral, render HTML → PNG → kirim ke division.tg_group_id
 */

import { getBrands } from './brand-configs.js';
import {
  getReferralsGroupedByDivision,
  upsertReferralDailySnapshot,
  getReferralMonthlyBreakdown,
} from '../storage/referral-store.js';
import { fetchMembersFiltered } from '../api/asia77-engine.js';
import { buildReferralReportHtml } from './referral-report-html.js';
import { renderPng } from './tim-renderer.js';
import { sendPhoto } from './tim-sender.js';
import { insertLog } from '../storage/log-store.js';
import { logger } from '../logger.js';

const DELAY_BETWEEN_DIVISIONS = 3000;
const DELAY_BETWEEN_BRANDS = 1500;

function toDDMMYYYY(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
}

/**
 * Kirim referral report harian untuk semua divisi pada tenant ini
 * @param {string} targetDate — YYYY-MM-DD (biasanya kemarin saat dipanggil 00:05)
 * @param {number} tenantId
 * @param {number|null} divisionId — kalau di-set, hanya kirim untuk divisi ini (untuk manual test)
 * @param {Object} [opts]
 * @param {boolean} [opts.skipTelegram=false] — true: hanya fetch + upsert snapshot, tidak render & kirim ke TG
 */
export async function sendReferralReports(targetDate, tenantId, divisionId = null, opts = {}) {
  const { skipTelegram = false } = opts;
  const allDivisions = await getReferralsGroupedByDivision(tenantId);
  const divisions = divisionId
    ? allDivisions.filter(d => d.division_id === parseInt(divisionId))
    : allDivisions;

  if (divisions.length === 0) {
    logger.warn({ tenantId }, 'No active divisions with referral codes configured — skip referral reports');
    return;
  }

  const brands = await getBrands(tenantId);
  const brandByKey = new Map(brands.map(b => [b.key, b]));
  const dateDDMMYYYY = toDDMMYYYY(targetDate);

  for (const div of divisions) {
    if (!skipTelegram && !div.tg_group_id) {
      logger.warn({ division: div.division_name }, 'Division has no tg_group_id — skip');
      continue;
    }

    const start = Date.now();
    try {
      // Group referral codes by brand
      const codesByBrand = new Map();
      for (const c of div.codes) {
        if (!codesByBrand.has(c.brand_key)) codesByBrand.set(c.brand_key, []);
        codesByBrand.get(c.brand_key).push(c);
      }

      // Aggregate per brand → per referral
      const brandReports = [];
      for (const [brandKey, codes] of codesByBrand.entries()) {
        const brand = brandByKey.get(brandKey);
        if (!brand) {
          logger.warn({ brandKey, division: div.division_name }, 'Referral code points to missing brand — skip');
          continue;
        }

        const referralCodes = codes.map(c => c.referral_code);

        // Fetch A: new members per referral
        let newMembers = [];
        try {
          newMembers = await fetchMembersFiltered(brand.key, brand.domain, brand.userId, {
            dateDDMMYYYY,
            newmb: true,
            referralCodes,
            cookieHeader: brand.cookieHeader,
          });
        } catch (err) {
          logger.error({ brand: brand.key, err: err.message }, 'Fetch new members failed');
        }
        await new Promise(r => setTimeout(r, 800));

        // Fetch B: non-new members (deposit aktif)
        let depoMembers = [];
        try {
          depoMembers = await fetchMembersFiltered(brand.key, brand.domain, brand.userId, {
            dateDDMMYYYY,
            newmb: false,
            referralCodes,
            cookieHeader: brand.cookieHeader,
          });
        } catch (err) {
          logger.error({ brand: brand.key, err: err.message }, 'Fetch depo members failed');
        }

        // Count per referral
        const refMap = new Map();
        for (const c of codes) {
          refMap.set(c.referral_code, {
            referral_code: c.referral_code,
            display_name: c.display_name || c.referral_code,
            new_regis: 0,
            depo_regis: 0,
          });
        }
        for (const m of newMembers) {
          const key = m.referral;
          if (refMap.has(key)) refMap.get(key).new_regis++;
        }
        for (const m of depoMembers) {
          const key = m.referral;
          if (refMap.has(key)) refMap.get(key).depo_regis++;
        }

        const refRows = Array.from(refMap.values());

        // Persist snapshot untuk history 30 hari
        for (const r of refRows) {
          try {
            await upsertReferralDailySnapshot(
              tenantId, div.division_id, brand.key, r.referral_code, targetDate,
              r.new_regis, r.depo_regis
            );
          } catch (err) {
            logger.warn({ err: err.message, brand: brand.key, ref: r.referral_code }, 'Snapshot upsert failed');
          }
        }

        brandReports.push({
          brand_key: brand.key,
          brand_name: brand.name,
          brand_color: brand.primary,
          referrals: refRows,
        });

        await new Promise(r => setTimeout(r, DELAY_BETWEEN_BRANDS));
      }

      if (skipTelegram) {
        const duration = Date.now() - start;
        logger.info({ division: div.division_name, date: targetDate, brands: brandReports.length }, 'Referral snapshot backfilled (no TG send)');
        await insertLog('referral-backfill', div.division_name, 'success', `${targetDate} · ${brandReports.length} brands`, duration);
      } else {
        // Ambil breakdown bulanan per (brand, referral) untuk divisi ini
        let monthly = [];
        try {
          monthly = await getReferralMonthlyBreakdown(tenantId, div.division_id, targetDate);
        } catch (err) {
          logger.warn({ err: err.message, division: div.division_name }, 'Get monthly breakdown failed');
        }

        // Render + send
        const html = buildReferralReportHtml({
          divisionName: div.division_name,
          date: targetDate,
          monthly,
        });
        const png = await renderPng(html, { width: 1720 });
        const caption = `📋 Referral Report │ ${div.division_name} │ ${targetDate}`;

        await sendPhoto(div.tg_group_id, png, caption, tenantId);

        const duration = Date.now() - start;
        logger.info({ division: div.division_name, brands: brandReports.length }, 'Referral report sent');
        await insertLog('referral-report', div.division_name, 'success', `${brandReports.length} brands`, duration);
      }
    } catch (err) {
      const duration = Date.now() - start;
      logger.error({ division: div.division_name, err: err.message }, 'Referral report failed');
      await insertLog(skipTelegram ? 'referral-backfill' : 'referral-report', div.division_name, 'error', err.message, duration);
    }

    await new Promise(r => setTimeout(r, DELAY_BETWEEN_DIVISIONS));
  }

  logger.info({ tenantId, divisions: divisions.length }, 'Referral report cycle complete');
}

/**
 * Backfill snapshot untuk rentang tanggal (tidak kirim Telegram).
 * Iterate per hari dari startDate ke endDate (inclusive) dan panggil
 * sendReferralReports dengan skipTelegram=true.
 */
export async function backfillReferralSnapshots(startDate, endDate, tenantId, divisionId = null) {
  const dates = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  if (end < start) throw new Error('endDate must be >= startDate');
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  logger.info({ tenantId, divisionId, dates: dates.length, startDate, endDate }, 'Referral backfill started');
  for (const date of dates) {
    try {
      await sendReferralReports(date, tenantId, divisionId, { skipTelegram: true });
    } catch (err) {
      logger.error({ date, err: err.message }, 'Referral backfill failed for date');
    }
  }
  logger.info({ tenantId, dates: dates.length }, 'Referral backfill complete');
}
