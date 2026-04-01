/**
 * Actions Routes — Manual fetch, report triggers, backfill
 *
 * Backfill logic:
 *   HARI INI  → TRX dari dpapp, REGIS dari /memberlist count (cara cepat)
 *   HARI LALU → REGIS per jam dari /memberlist + join_time parse (cara detail)
 *               TRX: hanya FINISH kemarin dari yddpapp
 */

import { fetchAllBrands, fetchAllBrandsFinish } from '../api/fetch-brand.js';
import { fetchAsia77Daily, fetchAsia77Regis, fetchAllMembersWithTime } from '../api/asia77-engine.js';
import { sendTimReports } from '../tim/tim-orchestrator.js';
import { upsertSnapshot, upsertSnapshotNullable, queryOne, queryRows } from '../storage/postgres.js';
import { getBrands } from '../tim/brand-configs.js';
import { insertLog } from '../storage/log-store.js';
import { DateTime } from '../utils/datetime.js';
import { logger } from '../logger.js';

export default async function actionRoutes(app) {
  // POST /api/actions/fetch-now
  app.post('/api/actions/fetch-now', async (request) => {
    const { brandKey } = request.body || {};
    const now = DateTime.now();
    const hour = now.hour;
    const dateStr = now.toDateStr();

    if (!hour) return { success: false, message: 'Cannot fetch at hour 0 (midnight)' };

    logger.info({ hour, brandKey }, 'Manual fetch triggered');
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
    sendTimReports(hour, dateStr, yesterdayStr, brandKey).catch(err => {
      logger.error({ err: err.message }, 'Manual report failed');
    });

    return { success: true, message: `Report started for ${brandKey || 'all brands'} at hour ${hour}` };
  });

  // POST /api/actions/fetch-finish
  app.post('/api/actions/fetch-finish', async (request) => {
    const { date } = request.body || {};
    const now = DateTime.now();
    const targetDate = date || now.yesterday().toDateStr();

    logger.info({ date: targetDate }, 'Manual FINISH fetch triggered');
    fetchAllBrandsFinish(targetDate).catch(err => {
      logger.error({ err: err.message }, 'Manual FINISH fetch failed');
    });

    return { success: true, message: `FINISH fetch started for ${targetDate}` };
  });

  // POST /api/actions/backfill
  app.post('/api/actions/backfill', async (request) => {
    const { date, brandKey } = request.body || {};
    const now = DateTime.now();
    const todayStr = now.toDateStr();
    const yesterdayStr = now.yesterday().toDateStr();
    const targetDate = date || todayStr;
    const isToday = targetDate === todayStr;

    const brands = getBrands();
    const targetBrands = brandKey ? brands.filter(b => b.key === brandKey) : brands;
    const results = [];

    for (const brand of targetBrands) {
      const start = Date.now();
      try {
        if (brand.engine !== 'asia77') {
          results.push({ brand: brand.key, success: false, message: 'Backfill hanya support asia77 engine' });
          continue;
        }

        const saved = [];

        if (isToday) {
          // ═══════════════════════════════════════
          // HARI INI: cara cepat (count total)
          // ═══════════════════════════════════════
          const daily = await fetchAsia77Daily(brand.key, brand.domain, brand.cookieHeader);
          const todayTrx = daily.dpapp || 0;
          const ydTrx = daily.yddpapp || 0;

          // Fetch regis hari ini (count cepat)
          const todayDDMMYYYY = formatDDMMYYYY(todayStr);
          const todayRegis = await fetchAsia77Regis(
            brand.key, brand.domain, todayDDMMYYYY, brand.userId, brand.cookieHeader
          );

          // Simpan jam sekarang
          if (now.hour > 0) {
            upsertSnapshot(brand.key, todayStr, now.hour, todayTrx, todayRegis);
            saved.push(`Jam ${now.hour}: TRX=${fmtNum(todayTrx)} REGIS=${fmtNum(todayRegis)}`);
          }

          // Interpolasi jam kosong hari ini
          if (now.hour > 1) {
            const filled = interpolateMissingHours(brand.key, todayStr, now.hour);
            if (filled > 0) saved.push(`Interpolasi ${filled} jam kosong`);
          }

          // Simpan FINISH kemarin
          if (ydTrx > 0) {
            const ydDDMMYYYY = formatDDMMYYYY(yesterdayStr);
            const ydRegis = await fetchAsia77Regis(
              brand.key, brand.domain, ydDDMMYYYY, brand.userId, brand.cookieHeader
            );
            upsertSnapshot(brand.key, yesterdayStr, 24, ydTrx, ydRegis);
            saved.push(`FINISH ${yesterdayStr}: TRX=${fmtNum(ydTrx)} REGIS=${fmtNum(ydRegis)}`);
          }

        } else {
          // ═══════════════════════════════════════
          // HARI LALU: parse join_time per jam
          // ═══════════════════════════════════════
          const targetDDMMYYYY = formatDDMMYYYY(targetDate);

          // Fetch semua member + join_time
          const members = await fetchAllMembersWithTime(
            brand.key, brand.domain, targetDDMMYYYY, brand.userId, brand.cookieHeader
          );
          const totalRegis = members.length;
          const hourlyRegis = buildHourlyRegis(members);

          saved.push(`Fetch ${fmtNum(totalRegis)} member dari /memberlist`);

          // Simpan REGIS per jam (kumulatif)
          // TRX: pakai data yang sudah ada, atau null jika tidak ada
          let regisFilled = 0;
          for (let h = 1; h <= 23; h++) {
            const cumulativeRegis = hourlyRegis[h] || 0;

            const existing = await queryOne(
              'SELECT deposit_accepted_count as trx FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = $3',
              [brand.key, targetDate, h]
            );

            const trx = existing?.trx > 0 ? existing.trx : null;
            await upsertSnapshotNullable(brand.key, targetDate, h, trx, cumulativeRegis);
            regisFilled++;
          }
          saved.push(`REGIS per jam: 23 jam terisi`);

          // Simpan FINISH
          // TRX: hanya tersedia jika target = kemarin (dari yddpapp)
          let finishTrx = null;
          if (targetDate === yesterdayStr) {
            const daily = await fetchAsia77Daily(brand.key, brand.domain, brand.cookieHeader);
            finishTrx = daily.yddpapp || null;
          }

          await upsertSnapshotNullable(brand.key, targetDate, 24, finishTrx, totalRegis);
          saved.push(`FINISH: TRX=${finishTrx ? fmtNum(finishTrx) : 'N/A'} REGIS=${fmtNum(totalRegis)}`);
        }

        const duration = Date.now() - start;
        results.push({ brand: brand.key, success: true, saved, duration });
        await insertLog('backfill', brand.key, 'success', saved.join(' | '), duration);

      } catch (err) {
        const duration = Date.now() - start;
        logger.error({ brand: brand.key, err: err.message }, 'Backfill failed');
        results.push({ brand: brand.key, success: false, error: err.message });
        await insertLog('backfill', brand.key, 'error', err.message, duration);
      }
    }

    return { success: true, targetDate, results };
  });

  // GET /api/actions/missing-hours
  app.get('/api/actions/missing-hours', async (request, reply) => {
    const { brand, date } = request.query;
    if (!brand || !date) return reply.code(400).send({ error: 'brand and date required' });

    const now = DateTime.now();
    const todayStr = now.toDateStr();
    const isToday = date === todayStr;
    const maxHour = isToday ? now.hour : 23;

    const existingRows = await queryRows(
      'SELECT hour FROM hourly_snapshots WHERE brand = $1 AND date = $2 ORDER BY hour',
      [brand, date]
    );
    const existing = existingRows.map(r => r.hour);

    const missing = [];
    for (let h = 1; h <= maxHour; h++) {
      if (!existing.includes(h)) missing.push(h);
    }
    const hasFinish = existing.includes(24);

    return {
      brand, date, isToday, maxHour,
      existingHours: existing,
      missingHours: missing,
      hasFinish,
      canBackfill: true,
      totalExpected: maxHour + 1,
      totalExisting: existing.length,
    };
  });
}

// ─── Helpers ───

function formatDDMMYYYY(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
}

function fmtNum(n) {
  return n?.toLocaleString('id-ID') || '0';
}

/**
 * Parse join_time → kumulatif REGIS per jam
 * hour=1 = member yang join di jam 00:xx (kumulatif)
 * hour=2 = member yang join di jam 00:xx + 01:xx (kumulatif)
 * ...dst
 */
function buildHourlyRegis(members) {
  const counts = new Array(24).fill(0);
  for (const m of members) {
    const match = m.join_time?.match(/(\d{2}):(\d{2}):(\d{2})$/);
    if (match) counts[parseInt(match[1])]++;
  }

  const cumulative = {};
  let total = 0;
  for (let h = 1; h <= 23; h++) {
    total += counts[h - 1];
    cumulative[h] = total;
  }
  total += counts[23];
  cumulative[24] = total;

  return cumulative;
}

async function interpolateMissingHours(brandKey, date, maxHour) {
  const existing = await queryRows(
    'SELECT hour, deposit_accepted_count as trx, regis_total as regis FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour <= $3 ORDER BY hour',
    [brandKey, date, maxHour]
  );

  if (existing.length < 2) return 0;

  const map = new Map(existing.map(r => [r.hour, r]));
  let filled = 0;

  for (let h = 1; h <= maxHour; h++) {
    if (map.has(h)) continue;

    let prev = null, next = null;
    for (let p = h - 1; p >= 0; p--) {
      if (p === 0) { prev = { hour: 0, trx: 0, regis: 0 }; break; }
      if (map.has(p)) { prev = map.get(p); break; }
    }
    for (let n = h + 1; n <= maxHour; n++) {
      if (map.has(n)) { next = map.get(n); break; }
    }

    if (!prev || !next) continue;

    const span = next.hour - prev.hour;
    const ratio = (h - prev.hour) / span;
    const trx = Math.round(prev.trx + (next.trx - prev.trx) * ratio);
    const regis = Math.round(prev.regis + (next.regis - prev.regis) * ratio);

    await upsertSnapshot(brandKey, date, h, trx, regis);
    map.set(h, { hour: h, trx, regis });
    filled++;
  }

  return filled;
}
