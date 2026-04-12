/**
 * Actions Routes — Manual fetch, report triggers, backfill
 *
 * Backfill logic:
 *   HARI INI  → TRX dari dpapp, REGIS dari /memberlist count (cara cepat)
 *   HARI LALU → REGIS per jam dari /memberlist + join_time parse (cara detail)
 *               TRX: hanya FINISH kemarin dari yddpapp
 */

import { fetchAllBrands, fetchAllBrandsFinish } from '../api/fetch-brand.js';
import { fetchAsia77Daily, fetchAsia77Regis, fetchAllMembersWithTime, fetchAsia77DepositHistory } from '../api/asia77-engine.js';
import { fetchSyntechDaily, fetchSyntechRegis, fetchSyntechPlayersWithTime } from '../api/syntech-engine.js';
import { sendTimReports } from '../tim/tim-orchestrator.js';
import { sendReferralReports, backfillReferralSnapshots, sendSingleReferralReport, backfillSingleReferral } from '../tim/referral-report-orchestrator.js';
import { upsertSnapshot, upsertSnapshotNullable, forceUpsertSnapshot, queryOne, queryRows } from '../storage/postgres.js';
import { getBrands } from '../tim/brand-configs.js';
import { insertLog } from '../storage/log-store.js';
import { DateTime } from '../utils/datetime.js';
import { logger } from '../logger.js';
import { tWhere } from '../middleware/tenant-scope.js';

export default async function actionRoutes(app) {
  // POST /api/actions/fetch-now
  app.post('/api/actions/fetch-now', async (request) => {
    const tid = request.tenantId;
    const { brandKey } = request.body || {};
    const now = DateTime.now();
    const hour = now.hour;
    const dateStr = now.toDateStr();

    if (!hour) return { success: false, message: 'Cannot fetch at hour 0 (midnight)' };

    logger.info({ hour, brandKey, tenantId: tid }, 'Manual fetch triggered');
    fetchAllBrands(dateStr, hour, tid).catch(err => {
      logger.error({ err: err.message }, 'Manual fetch failed');
    });

    return { success: true, message: `Fetch started for ${brandKey || 'all brands'} at hour ${hour}` };
  });

  // POST /api/actions/report-now
  app.post('/api/actions/report-now', async (request) => {
    const tid = request.tenantId;
    const { brandKey } = request.body || {};
    const now = DateTime.now();
    const hour = now.hour || 23;
    const dateStr = now.toDateStr();
    const yesterdayStr = now.yesterday().toDateStr();

    logger.info({ hour, brandKey, tenantId: tid }, 'Manual report triggered');
    sendTimReports(hour, dateStr, yesterdayStr, brandKey, tid).catch(err => {
      logger.error({ err: err.message }, 'Manual report failed');
    });

    return { success: true, message: `Report started for ${brandKey || 'all brands'} at hour ${hour}` };
  });

  // POST /api/actions/fetch-finish
  app.post('/api/actions/fetch-finish', async (request) => {
    const tid = request.tenantId;
    const { date } = request.body || {};
    const now = DateTime.now();
    const targetDate = date || now.yesterday().toDateStr();

    logger.info({ date: targetDate, tenantId: tid }, 'Manual FINISH fetch triggered');
    fetchAllBrandsFinish(targetDate, tid).catch(err => {
      logger.error({ err: err.message }, 'Manual FINISH fetch failed');
    });

    return { success: true, message: `FINISH fetch started for ${targetDate}` };
  });

  // POST /api/actions/referral-report-now
  app.post('/api/actions/referral-report-now', async (request) => {
    const tid = request.tenantId;
    const { date, divisionId } = request.body || {};
    const targetDate = date || DateTime.now().yesterday().toDateStr();

    logger.info({ tenantId: tid, targetDate, divisionId }, 'Manual referral report triggered');
    sendReferralReports(targetDate, tid, divisionId || null).catch(err => {
      logger.error({ err: err.message }, 'Manual referral report failed');
    });

    return { success: true, message: `Referral report started for ${targetDate}` };
  });

  // POST /api/actions/referral-report-single
  // body: { referralId, date? }
  // Kirim report untuk 1 referral saja (tombol per-row di admin panel)
  app.post('/api/actions/referral-report-single', async (request, reply) => {
    const tid = request.tenantId;
    const { referralId, date } = request.body || {};
    if (!referralId) return reply.code(400).send({ error: 'referralId required' });

    const targetDate = date || DateTime.now().yesterday().toDateStr();
    logger.info({ tenantId: tid, referralId, targetDate }, 'Single referral report triggered');

    try {
      await sendSingleReferralReport(referralId, targetDate, tid);
      return { success: true, message: `Referral report sent for ${targetDate}` };
    } catch (err) {
      logger.error({ referralId, err: err.message }, 'Single referral report failed');
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/actions/referral-backfill
  // body: { startDate, endDate, divisionId? }
  // Iterate date range, fetch members per day, upsert snapshots — no Telegram send.
  app.post('/api/actions/referral-backfill', async (request, reply) => {
    const tid = request.tenantId;
    const { startDate, endDate, divisionId } = request.body || {};
    if (!startDate || !endDate) {
      return reply.code(400).send({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
    }

    logger.info({ tenantId: tid, startDate, endDate, divisionId }, 'Referral backfill triggered');
    backfillReferralSnapshots(startDate, endDate, tid, divisionId || null).catch(err => {
      logger.error({ err: err.message }, 'Referral backfill failed');
    });

    return { success: true, message: `Backfill started for ${startDate} to ${endDate}` };
  });

  // POST /api/actions/referral-backfill-single
  // body: { referralId, startDate, endDate }
  // Backfill 1 referral saja untuk range tanggal — sync, tidak kirim TG
  app.post('/api/actions/referral-backfill-single', async (request, reply) => {
    const tid = request.tenantId;
    const { referralId, startDate, endDate } = request.body || {};
    if (!referralId) return reply.code(400).send({ error: 'referralId required' });
    if (!startDate || !endDate) {
      return reply.code(400).send({ error: 'startDate and endDate are required (YYYY-MM-DD)' });
    }

    logger.info({ tenantId: tid, referralId, startDate, endDate }, 'Single referral backfill triggered');
    try {
      const result = await backfillSingleReferral(referralId, startDate, endDate, tid);
      return { success: true, ...result };
    } catch (err) {
      logger.error({ referralId, err: err.message }, 'Single referral backfill failed');
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/actions/backfill
  app.post('/api/actions/backfill', async (request) => {
    const tid = request.tenantId;
    const { date, brandKey } = request.body || {};
    const now = DateTime.now();
    const todayStr = now.toDateStr();
    const yesterdayStr = now.yesterday().toDateStr();
    const targetDate = date || todayStr;
    const isToday = targetDate === todayStr;

    const brands = await getBrands(tid);
    const targetBrands = brandKey ? brands.filter(b => b.key === brandKey) : brands;
    const results = [];

    for (const brand of targetBrands) {
      const start = Date.now();
      try {
        const saved = [];
        const maxHour = isToday ? now.hour : 23;

        // ═══════════════════════════════════════
        // ENGINE: ASIA77
        // REGIS per jam dari /memberlist join_time
        // TRX hanya dari auto-fetch (tidak di-backfill)
        // ═══════════════════════════════════════
        if (brand.engine === 'asia77') {
          const targetDDMMYYYY = formatDDMMYYYY(targetDate);

          // 1. Fetch member list → REGIS per jam
          const members = await fetchAllMembersWithTime(
            brand.key, brand.domain, targetDDMMYYYY, brand.userId, brand.cookieHeader
          );
          const totalRegis = members.length;
          const hourlyRegis = buildHourlyRegis(members);
          saved.push(`Fetch ${totalRegis} members dari /memberlist`);

          // 2. Simpan REGIS per jam (pertahankan TRX yang sudah ada dari auto-fetch)
          let filled = 0;
          for (let h = 1; h <= maxHour; h++) {
            const regis = hourlyRegis[h] || 0;
            const existing = await queryOne(
              'SELECT deposit_accepted_count as trx FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = $3 AND tenant_id = $4',
              [brand.key, targetDate, h, tid]
            );
            const trx = existing?.trx > 0 ? existing.trx : null;
            await upsertSnapshotNullable(brand.key, targetDate, h, trx, regis, tid);
            filled++;
          }
          saved.push(`REGIS per jam: ${filled} jam terisi`);

          // 3. Simpan FINISH
          if (!isToday) {
            const existingFinish = await queryOne(
              'SELECT deposit_accepted_count as trx FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = 24 AND tenant_id = $3',
              [brand.key, targetDate, tid]
            );
            const finishTrx = existingFinish?.trx > 0 ? existingFinish.trx : null;
            await upsertSnapshotNullable(brand.key, targetDate, 24, finishTrx, totalRegis, tid);
            saved.push(`FINISH: TRX=${finishTrx ? fmtNum(finishTrx) : 'N/A'} REGIS=${fmtNum(totalRegis)}`);
          }

          // 4. Jika hari ini, ambil TRX kumulatif saat ini + FINISH kemarin
          if (isToday) {
            const daily = await fetchAsia77Daily(brand.key, brand.domain, brand.cookieHeader);
            const todayTrx = daily.dpapp || 0;
            const currentRegis = hourlyRegis[now.hour] || totalRegis;

            if (now.hour > 0) {
              await upsertSnapshot(brand.key, todayStr, now.hour, todayTrx, currentRegis, tid);
              saved.push(`Jam ${now.hour}: TRX=${fmtNum(todayTrx)} REGIS=${fmtNum(currentRegis)}`);
            }

            const ydTrx = daily.yddpapp || 0;
            if (ydTrx > 0) {
              const ydDDMMYYYY = formatDDMMYYYY(yesterdayStr);
              const ydRegis = await fetchAsia77Regis(brand.key, brand.domain, ydDDMMYYYY, brand.userId, brand.cookieHeader);
              await upsertSnapshot(brand.key, yesterdayStr, 24, ydTrx, ydRegis, tid);
              saved.push(`FINISH ${yesterdayStr}: TRX=${fmtNum(ydTrx)} REGIS=${fmtNum(ydRegis)}`);
            }
          }

        // ═══════════════════════════════════════
        // ENGINE: SYNTECH
        // REGIS per jam dari /services/players (parse created_at)
        // TRX hanya dari snapshot kumulatif terkini (tidak di-backfill)
        // ═══════════════════════════════════════
        } else if (brand.engine === 'syntech') {
          const config = {
            domain: brand.domain,
            user: brand.user,
            pass: brand.pass,
            pin: brand.pin,
            apiKey: brand.apiKey,
            hash: brand.hash,
          };

          const startISO = `${targetDate}T00:00:00.000+07:00`;
          const endISO = `${targetDate}T23:59:59.999+07:00`;

          // 1. Fetch semua player di tanggal target → REGIS per jam dari created_at
          const players = await fetchSyntechPlayersWithTime(config, startISO, endISO);
          const totalRegis = players.length;
          const hourlyRegis = buildHourlyRegisFromCreatedAt(players);
          saved.push(`Fetch ${totalRegis} players dari /services/players`);

          // 2. Simpan REGIS per jam (pertahankan TRX yang sudah ada dari auto-fetch)
          let filled = 0;
          for (let h = 1; h <= maxHour; h++) {
            const regis = hourlyRegis[h] || 0;
            const existing = await queryOne(
              'SELECT deposit_accepted_count as trx FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = $3 AND tenant_id = $4',
              [brand.key, targetDate, h, tid]
            );
            const trx = existing?.trx > 0 ? existing.trx : null;
            await upsertSnapshotNullable(brand.key, targetDate, h, trx, regis, tid);
            filled++;
          }
          saved.push(`REGIS per jam: ${filled} jam terisi`);

          // 3. Simpan FINISH (TRX dari snapshot end-of-day kalau target bukan hari ini)
          if (!isToday) {
            const existingFinish = await queryOne(
              'SELECT deposit_accepted_count as trx FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = 24 AND tenant_id = $3',
              [brand.key, targetDate, tid]
            );
            const finishTrx = existingFinish?.trx > 0 ? existingFinish.trx : null;
            await upsertSnapshotNullable(brand.key, targetDate, 24, finishTrx, totalRegis, tid);
            saved.push(`FINISH: TRX=${finishTrx ? fmtNum(finishTrx) : 'N/A'} REGIS=${fmtNum(totalRegis)}`);
          }

          // 4. Jika hari ini, ambil snapshot kumulatif terkini untuk jam aktif
          if (isToday && now.hour > 0) {
            const dateISO = `${todayStr}T${String(now.hour).padStart(2, '0')}:00:00+07:00`;
            const daily = await fetchSyntechDaily(config, dateISO);
            const todayTrx = daily.deposit_action_accepted_count || 0;
            const currentRegis = hourlyRegis[now.hour] || totalRegis;
            await upsertSnapshot(brand.key, todayStr, now.hour, todayTrx, currentRegis, tid);
            saved.push(`Jam ${now.hour}: TRX=${fmtNum(todayTrx)} REGIS=${fmtNum(currentRegis)}`);
          }

        } else {
          results.push({ brand: brand.key, success: false, message: `Backfill belum support engine ${brand.engine}` });
          continue;
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

  // POST /api/actions/import-snapshots
  // body: { rows: [{brand, date, hour, trx, regis}, ...] }
  // Bulk import hourly snapshot dari CSV upload (dry-run-able client-side first).
  // Force upsert — selalu overwrite data existing untuk slot (brand, date, hour) yang sama.
  //
  // Partial update: trx atau regis boleh null → kolom yg null akan ambil nilai
  // existing dari DB (preserve). Kedua null = baris di-tolak (tidak ada perubahan).
  app.post('/api/actions/import-snapshots', async (request, reply) => {
    const tid = request.tenantId;
    const { rows } = request.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return reply.code(400).send({ error: 'rows array required' });
    }
    if (rows.length > 5000) {
      return reply.code(400).send({ error: 'maksimal 5000 baris per import' });
    }

    // Whitelist brand keys yang aktif untuk tenant ini supaya import tidak bocor antar tenant
    const validBrands = await queryRows(
      'SELECT key FROM report_brands WHERE tenant_id = $1',
      [tid]
    );
    const validBrandSet = new Set(validBrands.map(b => b.key));

    const start = Date.now();
    let inserted = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNo = i + 2; // CSV header line + 1-indexed
      try {
        const brand = String(row.brand || '').trim();
        const date = String(row.date || '').trim();
        const hour = parseInt(row.hour, 10);

        // trx & regis sengaja boleh null → preserve existing
        const trxRaw = row.trx;
        const regisRaw = row.regis;
        const hasTrx = trxRaw !== null && trxRaw !== undefined && trxRaw !== '';
        const hasRegis = regisRaw !== null && regisRaw !== undefined && regisRaw !== '';

        // Validate brand
        if (!brand) { errors.push({ line: lineNo, error: 'brand kosong' }); continue; }
        if (!validBrandSet.has(brand)) {
          errors.push({ line: lineNo, error: `brand "${brand}" tidak ditemukan untuk tenant ini` });
          continue;
        }

        // Validate date YYYY-MM-DD
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          errors.push({ line: lineNo, error: `date "${date}" harus YYYY-MM-DD` });
          continue;
        }

        // Validate hour 0..24
        if (!Number.isFinite(hour) || hour < 0 || hour > 24) {
          errors.push({ line: lineNo, error: `hour "${row.hour}" harus angka 0-24` });
          continue;
        }

        // Validate trx & regis (kalau di-set)
        let trx = null;
        let regis = null;
        if (hasTrx) {
          trx = parseInt(trxRaw, 10);
          if (!Number.isFinite(trx) || trx < 0) {
            errors.push({ line: lineNo, error: `trx "${trxRaw}" harus angka >= 0 atau kosong` });
            continue;
          }
        }
        if (hasRegis) {
          regis = parseInt(regisRaw, 10);
          if (!Number.isFinite(regis) || regis < 0) {
            errors.push({ line: lineNo, error: `regis "${regisRaw}" harus angka >= 0 atau kosong` });
            continue;
          }
        }

        // Keduanya kosong → tidak ada gunanya update
        if (!hasTrx && !hasRegis) {
          errors.push({ line: lineNo, error: 'trx dan regis kedua-duanya kosong, tidak ada yang di-update' });
          continue;
        }

        // Partial update: kalau salah satu null, ambil dari existing snapshot
        if (trx === null || regis === null) {
          const existing = await queryOne(
            'SELECT deposit_accepted_count, regis_total FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = $3 AND tenant_id = $4',
            [brand, date, hour, tid]
          );
          if (trx === null) trx = existing?.deposit_accepted_count ?? 0;
          if (regis === null) regis = existing?.regis_total ?? 0;
        }

        await forceUpsertSnapshot(brand, date, hour, trx, regis, tid);
        inserted++;
      } catch (err) {
        errors.push({ line: lineNo, error: err.message });
      }
    }

    const duration = Date.now() - start;
    logger.info({ tenantId: tid, inserted, errors: errors.length, duration }, 'Snapshot CSV import complete');
    await insertLog(
      'import',
      'CSV',
      errors.length === 0 ? 'success' : (inserted === 0 ? 'error' : 'success'),
      `${inserted} baris terimport, ${errors.length} error`,
      duration
    );

    return {
      success: true,
      total: rows.length,
      inserted,
      failed: errors.length,
      errors: errors.slice(0, 50), // cap supaya response tidak meledak
    };
  });

  // GET /api/actions/missing-hours
  app.get('/api/actions/missing-hours', async (request, reply) => {
    const tid = request.tenantId;
    const { brand, date } = request.query;
    if (!brand || !date) return reply.code(400).send({ error: 'brand and date required' });

    const now = DateTime.now();
    const todayStr = now.toDateStr();
    const isToday = date === todayStr;
    const maxHour = isToday ? now.hour : 23;

    const existingRows = await queryRows(
      'SELECT hour FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND tenant_id = $3 ORDER BY hour',
      [brand, date, tid]
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

/**
 * Versi untuk syntech: parse `created_at` ISO 8601 (e.g. "2026-04-11T07:34:21.000+07:00")
 * → kumulatif REGIS per jam, dalam zona Asia/Phnom_Penh (UTC+7).
 *
 * Hour-of-day diambil setelah konversi ke UTC+7 supaya match dengan logic asia77
 * (yang ambil jam dari string "DD-MM-YYYY HH:MM:SS" yang sudah dalam timezone panel).
 */
function buildHourlyRegisFromCreatedAt(players) {
  const counts = new Array(24).fill(0);
  for (const p of players) {
    if (!p?.created_at) continue;
    const d = new Date(p.created_at);
    if (isNaN(d.getTime())) continue;
    // Adjust ke UTC+7
    const utc7 = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    const hour = utc7.getUTCHours();
    counts[hour]++;
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

/**
 * Parse rcdtm dari deposit history → kumulatif TRX per jam
 * rcdtm format: "02-04-2026 20:10:58"
 */
function buildHourlyTrx(deposits) {
  const counts = new Array(24).fill(0);
  for (const dp of deposits) {
    const match = dp.rcdtm?.match(/(\d{2}):(\d{2}):(\d{2})$/);
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

async function interpolateMissingHours(brandKey, date, maxHour, tid) {
  const existing = await queryRows(
    'SELECT hour, deposit_accepted_count as trx, regis_total as regis FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour <= $3 AND tenant_id = $4 ORDER BY hour',
    [brandKey, date, maxHour, tid]
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

    await upsertSnapshot(brandKey, date, h, trx, regis, tid);
    map.set(h, { hour: h, trx, regis });
    filled++;
  }

  return filled;
}
