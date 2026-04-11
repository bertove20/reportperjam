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
  getReferralCode,
} from '../storage/referral-store.js';
import { queryOne } from '../storage/postgres.js';
import { fetchMembersFiltered } from '../api/asia77-engine.js';
import { fetchSyntechMembersFiltered } from '../api/syntech-engine.js';
import { buildReferralReportHtml } from './referral-report-html.js';
import { renderPng } from './tim-renderer.js';
import { sendPhoto } from './tim-sender.js';
import { insertLog } from '../storage/log-store.js';
import { logger } from '../logger.js';

const DELAY_BETWEEN_DIVISIONS = 3000;
const DELAY_BETWEEN_BRANDS = 1500;
const DELAY_BETWEEN_REFERRAL_SENDS = 1500;
const DELAY_BETWEEN_GROUP_COPIES = 400;

function toDDMMYYYY(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
}

/**
 * Engine-agnostic fetch untuk referral filter.
 * Dispatch ke implementasi engine yang sesuai dan return list member.
 *
 * Mode:
 *   'new'  → semua player yang register di tanggal target via referral X
 *            (= "berapa orang register hari itu", event-based)
 *   'depo' → SUBSET dari 'new' yang sudah deposit minimal sekali
 *            (= "berapa yang sudah convert dari register ke depositor")
 *
 * Untuk asia77, mode ini di-translate ke `newmb` flag (event-based, akurat
 * per tanggal). Untuk syntech, mode 'depo' pakai `total_deposit=gt0` yang
 * berbasis state SAAT INI — untuk backfill tanggal lalu, angka mencerminkan
 * state hari ini bukan state historis. Daily cron jam 00:05 (fetch kemarin)
 * tetap akurat karena delay-nya hanya ~24 jam.
 *
 * @param {object} brand - dari getBrands(), harus include engine, domain, credentials
 * @param {string} targetDate - YYYY-MM-DD
 * @param {'new'|'depo'} mode
 * @param {string} referralCode - kode referral spesifik
 * @returns {Promise<Array>} list member (count yang dipakai = .length)
 */
async function fetchReferralMembers(brand, targetDate, mode, referralCode) {
  if (brand.engine === 'asia77') {
    // asia77 punya filter event-based langsung
    return fetchMembersFiltered(brand.key, brand.domain, brand.userId, {
      dateDDMMYYYY: toDDMMYYYY(targetDate),
      newmb: mode === 'new',
      referralCodes: [referralCode],
      cookieHeader: brand.cookieHeader,
    });
  }

  if (brand.engine === 'syntech') {
    const config = {
      domain: brand.domain,
      user: brand.user,
      pass: brand.pass,
      pin: brand.pin,
      apiKey: brand.apiKey,
      hash: brand.hash,
    };
    // syntech: 'new' = semua ter-referral di rentang (no deposit filter)
    //          'depo' = subset yang sudah deposit (total_deposit=gt0)
    return fetchSyntechMembersFiltered(config, {
      startISO: `${targetDate}T00:00:00.000+07:00`,
      endISO: `${targetDate}T23:59:59.999+07:00`,
      depositFilter: mode === 'depo' ? 'gt0' : null,
      referralCodes: [referralCode],
    });
  }

  throw new Error(`Engine ${brand.engine} belum support referral fetch`);
}

/**
 * Parse tg_group_id field into an array of chat IDs.
 * Accepts newline-separated, comma-separated, or space-separated input.
 * Silently drops empty lines and duplicates.
 */
function parseTgGroupIds(raw) {
  if (!raw) return [];
  const parts = String(raw).split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  return Array.from(new Set(parts));
}

/**
 * Kirim satu PNG ke banyak Telegram group. Render sekali, kirim N kali.
 * Error per group dicatat tapi tidak menghentikan group berikutnya.
 * @returns {number} jumlah group yang sukses
 */
async function sendPhotoMulti(groupIds, png, caption, tenantId) {
  let ok = 0;
  for (const gid of groupIds) {
    try {
      await sendPhoto(gid, png, caption, tenantId);
      ok++;
    } catch (err) {
      logger.error({ groupId: gid, err: err.message }, 'sendPhoto to group failed');
    }
    if (groupIds.length > 1) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_GROUP_COPIES));
    }
  }
  return ok;
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

  for (const div of divisions) {
    const groupIds = parseTgGroupIds(div.tg_group_id);
    if (!skipTelegram && groupIds.length === 0) {
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

        // Fetch per referral code satu-satu (API hanya support 1 refusnm per request)
        const refMap = new Map();
        for (const c of codes) {
          refMap.set(c.referral_code, {
            referral_code: c.referral_code,
            display_name: c.display_name || c.referral_code,
            new_regis: 0,
            depo_regis: 0,
          });

          // Fetch A: new members (semua register di tanggal ini via referral)
          try {
            const newMembers = await fetchReferralMembers(brand, targetDate, 'new', c.referral_code);
            refMap.get(c.referral_code).new_regis = newMembers.length;
          } catch (err) {
            logger.error({ brand: brand.key, ref: c.referral_code, err: err.message }, 'Fetch new members failed');
          }
          await new Promise(r => setTimeout(r, 500));

          // Fetch B: deposit members (subset yang sudah convert ke depositor)
          try {
            const depoMembers = await fetchReferralMembers(brand, targetDate, 'depo', c.referral_code);
            refMap.get(c.referral_code).depo_regis = depoMembers.length;
          } catch (err) {
            logger.error({ brand: brand.key, ref: c.referral_code, err: err.message }, 'Fetch depo members failed');
          }
          await new Promise(r => setTimeout(r, 500));
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

        // Kirim per referral — 1 gambar = 1 pesan.
        // Ini mencegah satu gambar raksasa kena PHOTO_INVALID_DIMENSIONS
        // dan bikin pesan lebih mudah dibaca di Telegram.
        // Kalau monthly kosong, kirim 1 fallback "empty" agar group tetap dapat notifikasi.
        // Kalau divisi punya multiple tg_group_id, render sekali → kirim ke semua group.
        const items = monthly.length > 0 ? monthly : [null];
        let sentCount = 0;
        for (const item of items) {
          try {
            const html = buildReferralReportHtml({
              divisionName: div.division_name,
              date: targetDate,
              monthly: item ? [item] : [],
            });
            const png = await renderPng(html, { width: 1720 });
            const caption = item
              ? `📋 ${div.division_name} │ ${item.brand_name} │ ${item.display_name || item.referral_code} │ ${targetDate}`
              : `📋 Referral Report │ ${div.division_name} │ ${targetDate} (tidak ada referral aktif)`;
            const okGroups = await sendPhotoMulti(groupIds, png, caption, tenantId);
            if (okGroups > 0) sentCount++;
          } catch (err) {
            logger.error({
              division: div.division_name,
              brand: item?.brand_name,
              ref: item?.referral_code,
              err: err.message,
            }, 'Send per-referral card failed');
          }
          await new Promise(r => setTimeout(r, DELAY_BETWEEN_REFERRAL_SENDS));
        }

        const duration = Date.now() - start;
        logger.info({ division: div.division_name, total: monthly.length, sent: sentCount, groups: groupIds.length }, 'Referral report sent (per-referral)');
        await insertLog('referral-report', div.division_name, 'success', `${sentCount}/${monthly.length || 0} cards → ${groupIds.length} group(s)`, duration);
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

/**
 * Kirim referral report untuk SATU referral saja (manual dari admin panel).
 *
 * Flow:
 *   1. Load referral row + division (buat dapat tg_group_id)
 *   2. Fetch members (new + depo) untuk tanggal target → upsert snapshot
 *   3. Ambil monthly breakdown untuk divisi, filter ke item yg matching
 *   4. Render HTML 1 card → sendPhoto (auto fallback sendDocument kalau terlalu besar)
 *
 * @param {number} referralId
 * @param {string} targetDate — YYYY-MM-DD
 * @param {number} tenantId
 * @returns {Promise<{ok: boolean, sent?: boolean, error?: string}>}
 */
export async function sendSingleReferralReport(referralId, targetDate, tenantId) {
  const start = Date.now();
  const ref = await getReferralCode(referralId, tenantId);
  if (!ref) throw new Error(`Referral ${referralId} not found`);
  if (!ref.division_id) throw new Error(`Referral ${ref.referral_code} tidak punya division — set division dulu`);

  const division = await queryOne(
    'SELECT id, name, tg_group_id FROM divisions WHERE id = $1 AND tenant_id = $2',
    [ref.division_id, tenantId]
  );
  if (!division) throw new Error(`Division ${ref.division_id} not found`);
  const groupIds = parseTgGroupIds(division.tg_group_id);
  if (groupIds.length === 0) throw new Error(`Division "${division.name}" tidak punya tg_group_id`);

  const brands = await getBrands(tenantId);
  const brand = brands.find(b => b.key === ref.brand_key);
  if (!brand) throw new Error(`Brand ${ref.brand_key} not found / not configured`);

  try {
    // Fetch A: new members (semua register di tanggal ini via referral)
    let newCount = 0;
    try {
      const newMembers = await fetchReferralMembers(brand, targetDate, 'new', ref.referral_code);
      newCount = newMembers.length;
    } catch (err) {
      logger.error({ brand: brand.key, ref: ref.referral_code, err: err.message }, 'Fetch new members failed (single)');
    }
    await new Promise(r => setTimeout(r, 500));

    // Fetch B: deposit members (subset yang sudah convert ke depositor)
    let depoCount = 0;
    try {
      const depoMembers = await fetchReferralMembers(brand, targetDate, 'depo', ref.referral_code);
      depoCount = depoMembers.length;
    } catch (err) {
      logger.error({ brand: brand.key, ref: ref.referral_code, err: err.message }, 'Fetch depo members failed (single)');
    }

    // Upsert snapshot untuk tanggal target
    try {
      await upsertReferralDailySnapshot(
        tenantId, ref.division_id, brand.key, ref.referral_code, targetDate, newCount, depoCount
      );
    } catch (err) {
      logger.warn({ err: err.message, brand: brand.key, ref: ref.referral_code }, 'Snapshot upsert failed (single)');
    }

    // Ambil monthly breakdown divisi lalu filter ke 1 item
    const monthly = await getReferralMonthlyBreakdown(tenantId, ref.division_id, targetDate);
    const item = monthly.find(m => m.brand_key === brand.key && m.referral_code === ref.referral_code);
    if (!item) {
      throw new Error(`Referral ${ref.referral_code} tidak muncul di monthly breakdown — mungkin non-active`);
    }

    // Render + send (ke semua group kalau divisi punya multiple)
    const html = buildReferralReportHtml({
      divisionName: division.name,
      date: targetDate,
      monthly: [item],
    });
    const png = await renderPng(html, { width: 1720 });
    const caption = `📋 ${division.name} │ ${item.brand_name} │ ${item.display_name || item.referral_code} │ ${targetDate}`;
    const okGroups = await sendPhotoMulti(groupIds, png, caption, tenantId);
    if (okGroups === 0) throw new Error(`Gagal kirim ke semua group (${groupIds.length})`);

    const duration = Date.now() - start;
    logger.info({
      referralId, brand: brand.key, ref: ref.referral_code, division: division.name,
      date: targetDate, groups: groupIds.length, ok: okGroups,
    }, 'Single referral report sent');
    await insertLog(
      'referral-report',
      division.name,
      'success',
      `${brand.key}/${ref.referral_code} · ${targetDate} → ${okGroups}/${groupIds.length} group(s)`,
      duration
    );

    return { ok: true, sent: true };
  } catch (err) {
    const duration = Date.now() - start;
    logger.error({
      referralId, brand: brand.key, ref: ref.referral_code, err: err.message,
    }, 'Single referral report failed');
    await insertLog(
      'referral-report',
      division.name,
      'error',
      `${brand.key}/${ref.referral_code}: ${err.message}`,
      duration
    );
    throw err;
  }
}
