/**
 * Tim Report Data — Query SQLite + Hitung Kolom
 * 
 * Ini adalah BRAIN dari Tim report. Semua kalkulasi ada di sini.
 * 
 * Output: rows[] + scoreboard + projection yang siap di-render ke HTML.
 */

import { getSnapshots } from '../storage/postgres.js';
import { logger } from '../logger.js';

/**
 * @param {string} brandKey - e.g. 'BRAND_A'
 * @param {string} todayDate - YYYY-MM-DD (hari report)
 * @param {string} yesterdayDate - YYYY-MM-DD (hari sebelum report)
 * @param {number} currentHour - jam sekarang (1-23), atau 0 untuk FINISH
 * @returns {object} { rows, scoreboard, projection }
 */
export async function getTimBrandData(brandKey, todayDate, yesterdayDate, currentHour) {
  try {
    // Query PostgreSQL
    const todayData = await getSnapshots(brandKey, todayDate);
    const yesterdayData = await getSnapshots(brandKey, yesterdayDate);

    // Convert ke map: hour → {trx, regis}
    const todayMap = new Map(todayData.map(r => [r.hour, r]));
    const yesterdayMap = new Map(yesterdayData.map(r => [r.hour, r]));

    // ─── Build 24 rows (selalu tampilkan semua + Finish) ───
    const rows = [];
    const hours = [...Array.from({ length: 23 }, (_, i) => i + 1), 24]; // 1-23 + Finish

    for (let i = 0; i < hours.length; i++) {
      const h = hours[i];
      const isFinish = h === 24;
      const label = h === 1 ? 'First Hour' : isFinish ? 'Finish' : `${h}:00`;
      
      const today = todayMap.get(h);
      const yesterday = yesterdayMap.get(h);
      const prevToday = i > 0 ? todayMap.get(hours[i - 1]) : null;

      // Kolom HARI INI
      const todayTrx = today?.deposit_accepted_count ?? null;
      const todayRegis = today?.regis_total ?? null;

      // Kolom KMRN (kemarin di jam yang sama)
      const yesterdayTrx = yesterday?.deposit_accepted_count ?? null;
      const yesterdayRegis = yesterday?.regis_total ?? null;

      // Kolom /JAM = hari_ini[jam_ini] - hari_ini[jam_sebelum]
      let perHourTrx = null;
      let perHourRegis = null;
      
      if (h === 1) {
        // First Hour: /JAM = null (tidak ada jam sebelumnya)
        perHourTrx = null;
        perHourRegis = null;
      } else if (isFinish) {
        // FINISH: /JAM = finish - hour23 (atau last available hour)
        const lastHour = todayMap.get(23) || todayMap.get(22) || todayMap.get(21);
        if (todayTrx !== null && lastHour) {
          perHourTrx = todayTrx - (lastHour.deposit_accepted_count || 0);
          perHourRegis = (todayRegis || 0) - (lastHour.regis_total || 0);
        }
      } else if (todayTrx !== null && prevToday) {
        perHourTrx = todayTrx - (prevToday.deposit_accepted_count || 0);
        perHourRegis = (todayRegis || 0) - (prevToday.regis_total || 0);
      }

      // Kolom SISA = hari_ini[jam_ini] - kemarin[jam_ini]
      const gapTrx = (todayTrx !== null && yesterdayTrx !== null) ? todayTrx - yesterdayTrx : null;
      const gapRegis = (todayRegis !== null && yesterdayRegis !== null) ? todayRegis - yesterdayRegis : null;

      // Tentukan status row
      const isFuture = currentHour > 0 && (isFinish || h > currentHour);
      const hasData = (todayTrx !== null || todayRegis !== null) && !isFuture;
      const isCurrent = hasData && (
        (currentHour > 0 && h === currentHour) ||
        (currentHour === 0 && isFinish)
      );

      rows.push({
        label,
        hour: h,
        trx: {
          today: isFuture ? null : todayTrx,
          yesterday: yesterdayTrx,
          perHour: isFuture ? null : perHourTrx,
          gap: isFuture ? null : gapTrx,
        },
        regis: {
          today: isFuture ? null : todayRegis,
          yesterday: yesterdayRegis,
          perHour: isFuture ? null : perHourRegis,
          gap: isFuture ? null : gapRegis,
        },
        isCurrent,
        isFuture,
      });
    }

    // ─── Scoreboard ───
    // Cari jam terakhir yang punya data (bukan currentHour yang mungkin belum ada data)
    let latestHour = currentHour === 0 ? 24 : currentHour;
    let latestToday = todayMap.get(latestHour);
    if (!latestToday && currentHour > 0) {
      // Fallback: cari jam terakhir yang ada datanya
      for (let h = currentHour; h >= 1; h--) {
        if (todayMap.has(h)) { latestHour = h; latestToday = todayMap.get(h); break; }
      }
    }
    const latestYesterday = yesterdayMap.get(latestHour);

    const trxToday = latestToday?.deposit_accepted_count ?? 0;
    const trxYesterday = latestYesterday?.deposit_accepted_count ?? 0;
    const trxGap = trxToday - trxYesterday;

    const regisToday = latestToday?.regis_total ?? 0;
    const regisYesterday = latestYesterday?.regis_total ?? 0;
    const regisGap = regisToday - regisYesterday;

    const scoreboard = {
      trxToday, trxYesterday, trxGap,
      trxBadge: trxGap > 0 ? 'AHEAD' : trxGap < 0 ? 'BEHIND' : 'EVEN',
      regisToday, regisYesterday, regisGap,
      regisBadge: regisGap > 0 ? 'AHEAD' : regisGap < 0 ? 'BEHIND' : 'EVEN',
      latestHour, // jam data terakhir yang dipakai
    };

    // ─── Projection ───
    const effectiveHour = currentHour === 0 ? 24 : latestHour;
    const pace = effectiveHour > 0 ? Math.round(trxToday / effectiveHour) : 0;
    const estEOD = pace * 24;
    const finishYesterday = yesterdayMap.get(24);
    const target = finishYesterday?.deposit_accepted_count ?? 0;

    const projection = {
      trx: { pace, estEOD, target, selisih: estEOD - target },
      regis: {
        pace: effectiveHour > 0 ? Math.round(regisToday / effectiveHour) : 0,
        estEOD: effectiveHour > 0 ? Math.round(regisToday / effectiveHour) * 24 : 0,
        target: finishYesterday?.regis_total ?? 0,
        selisih: 0,
      },
    };
    projection.regis.selisih = projection.regis.estEOD - projection.regis.target;

    // ─── Trend bar (per-hour gap history) ───
    const trendGaps = [];
    for (let h = 1; h <= Math.min(currentHour || 23, 23); h++) {
      const t = todayMap.get(h);
      const y = yesterdayMap.get(h);
      if (t && y) {
        trendGaps.push({ hour: h, gap: t.deposit_accepted_count - y.deposit_accepted_count });
      }
    }

    return { rows, scoreboard, projection, trendGaps };
    
  } catch (err) {
    logger.error({ err, brandKey }, 'getTimBrandData failed');
    // Return empty structure — template akan render "no data"
    return { rows: [], scoreboard: null, projection: null, trendGaps: [] };
  }
}
