/**
 * ENGINE TYPE C: IDNS/iSports — Cookie-based Laravel SSR
 *
 * Panel Laravel SSR (agent.idns889.com), auth via laravel_session cookie.
 * Login manual (captcha + 2FA), data di-scrape dari HTML pakai cheerio.
 *
 * Auth:
 *   - laravel_session + XSRF-TOKEN cookies (set manual dari browser DevTools)
 *   - Session expires after idle — keepalive via GET /dashboard
 *   - Captcha + TOTP on login page, so auto-login is not possible
 *
 * Endpoints:
 *   GET /deposit/history                        -> summary TRX per hari
 *   GET /deposit/history/{YYYY-MM-DD}/{wlId}    -> detail deposit per hari (XHR)
 *   GET /player/list/?sort=3&val=1              -> daftar player (REGIS)
 *   GET /dashboard                              -> keepalive
 */

import * as cheerio from 'cheerio';
import { logger } from '../logger.js';

/**
 * Shared fetch helper — kirim request dengan cookie dan cek response
 */
async function idnsFetch(url, cookieHeader, opts = {}) {
  const headers = {
    'Cookie': cookieHeader,
    'Accept': 'text/html, application/xhtml+xml, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ...opts.headers,
  };

  const response = await fetch(url, {
    headers,
    redirect: 'manual', // jangan auto-follow redirect ke login
    signal: AbortSignal.timeout(30000),
  });

  // Redirect ke login = session expired
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location') || '';
    if (location.includes('login') || location.includes('auth')) {
      throw new Error('Session expired — redirect ke login, perlu login ulang');
    }
  }

  if (response.status === 419) {
    throw new Error('CSRF token mismatch (419) — session expired, perlu login ulang');
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(`Auth error (${response.status}) — cookie expired, perlu login ulang`);
  }

  if (!response.ok) {
    throw new Error(`IDNS HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();

  // Cek apakah response adalah halaman login (session expired tapi tidak redirect)
  if (html.includes('name="password"') && html.includes('name="username"')) {
    throw new Error('Session expired — response adalah halaman login, perlu login ulang');
  }

  return html;
}

/**
 * Fetch TRX (approved deposit count) untuk satu tanggal.
 *
 * Menggunakan detail page /deposit/history/{date}/{wlId} yang return HTML fragment
 * via XHR. Count row dengan status "Diapprove" untuk angka TRX yang akurat.
 *
 * @param {string} brandKey
 * @param {string} domain
 * @param {string} cookieHeader
 * @param {number} userId — whitelabel ID (e.g. 331)
 * @param {string} dateStr — YYYY-MM-DD
 * @returns {number} approved deposit count
 */
export async function fetchIdnsDaily(brandKey, domain, cookieHeader, userId, dateStr) {
  if (!cookieHeader) throw new Error(`No cookies for ${brandKey} — perlu login`);

  const url = `https://${domain}/deposit/history/${dateStr}/${userId}`;
  const html = await idnsFetch(url, cookieHeader, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });

  const $ = cheerio.load(html);
  let approved = 0;

  $('table tbody tr').each((_, row) => {
    const rowHtml = $(row).html() || '';
    const rowText = $(row).text();
    // Status "Diapprove" ditandai dengan badge/span hijau
    if (rowHtml.includes('Diapprove') || rowHtml.includes('diapprove') ||
        rowHtml.includes('badge-success') || rowHtml.includes('bg-success')) {
      approved++;
    }
  });

  logger.info({ brand: brandKey, date: dateStr, trx: approved }, 'IDNS TRX fetched');
  return approved;
}

/**
 * Fetch deposit detail dengan timestamp — untuk backfill TRX per jam.
 *
 * Parse setiap row deposit dari /deposit/history/{date}/{wlId},
 * return array objek dengan timestamp dan status.
 *
 * @returns {Array<{datetime: string, approved: boolean}>}
 */
export async function fetchIdnsDepositHistory(brandKey, domain, cookieHeader, userId, dateStr) {
  if (!cookieHeader) throw new Error(`No cookies for ${brandKey} — perlu login`);

  const url = `https://${domain}/deposit/history/${dateStr}/${userId}`;
  const html = await idnsFetch(url, cookieHeader, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });

  const $ = cheerio.load(html);
  const deposits = [];

  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    const rowHtml = $(row).html() || '';

    const isApproved = rowHtml.includes('Diapprove') || rowHtml.includes('diapprove') ||
                       rowHtml.includes('badge-success') || rowHtml.includes('bg-success');

    // Cari cell yang mengandung timestamp (format "DD/MM/YYYY HH:MM:SS")
    let datetime = null;
    cells.each((_, cell) => {
      const text = $(cell).text().trim();
      const match = text.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/);
      if (match) datetime = match[1];
    });

    deposits.push({ datetime, approved: isApproved });
  });

  return deposits;
}

/**
 * Fetch REGIS (jumlah player terdaftar) untuk satu tanggal.
 *
 * Scrape /player/list yang di-sort by Tanggal Daftar,
 * count row yang "Tanggal Daftar"-nya cocok dengan target date.
 * Pagination handled: stop kalau sudah melewati tanggal target.
 *
 * @param {string} brandKey
 * @param {string} domain
 * @param {string} cookieHeader
 * @param {string} dateStr — YYYY-MM-DD
 * @returns {number} total registrations
 */
export async function fetchIdnsRegis(brandKey, domain, cookieHeader, dateStr) {
  if (!cookieHeader) throw new Error(`No cookies for ${brandKey} — perlu login`);

  const [y, m, d] = dateStr.split('-');
  const targetDateDisplay = `${d}/${m}/${y}`; // DD/MM/YYYY — format tampilan panel

  let total = 0;
  let page = 1;

  while (true) {
    // sort=3 = by Tanggal Daftar, val=1 = descending (newest first)
    const url = `https://${domain}/player/list/?username=&contact=&acc_bank=&tier=&sort=3&val=1&page=${page}`;
    const html = await idnsFetch(url, cookieHeader);
    const $ = cheerio.load(html);

    // Cari index kolom "Tanggal Daftar" dari header
    let dateColIdx = -1;
    $('table thead th, table thead td').each((i, th) => {
      const text = $(th).text().trim().toLowerCase();
      if (text.includes('tanggal daftar') || text.includes('tgl daftar') || text.includes('register')) {
        dateColIdx = i;
      }
    });

    // Fallback: kalau header tidak ditemukan, coba cari dari data cells
    if (dateColIdx === -1) {
      // Scan first row untuk cell yang match date pattern
      const firstRow = $('table tbody tr').first();
      firstRow.find('td').each((i, cell) => {
        if ($(cell).text().trim().match(/\d{2}\/\d{2}\/\d{4}/)) {
          dateColIdx = i;
          return false;
        }
      });
    }

    if (dateColIdx === -1) {
      logger.warn({ brand: brandKey, page }, 'IDNS: kolom Tanggal Daftar tidak ditemukan');
      break;
    }

    let matchCount = 0;
    let totalRows = 0;
    let foundOlderDate = false;

    $('table tbody tr').each((_, row) => {
      totalRows++;
      const dateCell = $(row).find('td').eq(dateColIdx).text().trim();

      if (dateCell.includes(targetDateDisplay)) {
        matchCount++;
      } else if (totalRows > 0 && matchCount > 0) {
        // Sorted desc by date — kalau sudah lewat target date, stop
        foundOlderDate = true;
      }
    });

    total += matchCount;

    // Stop conditions:
    // 1. Sudah menemukan tanggal lebih lama (sorted desc)
    // 2. Tidak ada row sama sekali
    // 3. Tidak ada link "next page"
    const hasNext = $('a[rel="next"]').length > 0 ||
                    $('ul.pagination li:last-child a').length > 0;

    if (foundOlderDate || totalRows === 0 || !hasNext) break;

    page++;
    if (page > 100) {
      logger.warn({ brand: brandKey, page }, 'IDNS regis pagination cap hit');
      break;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  logger.info({ brand: brandKey, date: dateStr, regis: total }, 'IDNS REGIS fetched');
  return total;
}

/**
 * Fetch player list dengan timestamp registrasi — untuk backfill REGIS per jam.
 *
 * Mirip fetchIdnsRegis tapi return array player + timestamp supaya
 * bisa di-breakdown per jam.
 *
 * @returns {Array<{regDate: string, regTime: string|null}>}
 */
export async function fetchIdnsPlayersWithTime(brandKey, domain, cookieHeader, dateStr) {
  if (!cookieHeader) throw new Error(`No cookies for ${brandKey} — perlu login`);

  const [y, m, d] = dateStr.split('-');
  const targetDateDisplay = `${d}/${m}/${y}`;

  const players = [];
  let page = 1;

  while (true) {
    const url = `https://${domain}/player/list/?username=&contact=&acc_bank=&tier=&sort=3&val=1&page=${page}`;
    const html = await idnsFetch(url, cookieHeader);
    const $ = cheerio.load(html);

    let dateColIdx = -1;
    $('table thead th, table thead td').each((i, th) => {
      const text = $(th).text().trim().toLowerCase();
      if (text.includes('tanggal daftar') || text.includes('tgl daftar') || text.includes('register')) {
        dateColIdx = i;
      }
    });

    if (dateColIdx === -1) {
      const firstRow = $('table tbody tr').first();
      firstRow.find('td').each((i, cell) => {
        if ($(cell).text().trim().match(/\d{2}\/\d{2}\/\d{4}/)) {
          dateColIdx = i;
          return false;
        }
      });
    }

    if (dateColIdx === -1) break;

    let totalRows = 0;
    let foundOlderDate = false;

    $('table tbody tr').each((_, row) => {
      totalRows++;
      const dateCell = $(row).find('td').eq(dateColIdx).text().trim();

      if (dateCell.includes(targetDateDisplay)) {
        // Coba extract timestamp DD/MM/YYYY HH:MM:SS
        const match = dateCell.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
        if (match) {
          // Convert ke ISO-ish format untuk buildHourlyRegisFromCreatedAt compatibility
          const iso = `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}:${match[6]}+07:00`;
          players.push({ created_at: iso });
        } else {
          // Hanya ada tanggal, tidak ada jam — push tanpa created_at
          players.push({ created_at: null });
        }
      } else if (players.length > 0) {
        foundOlderDate = true;
      }
    });

    const hasNext = $('a[rel="next"]').length > 0 ||
                    $('ul.pagination li:last-child a').length > 0;

    if (foundOlderDate || totalRows === 0 || !hasNext) break;

    page++;
    if (page > 100) break;

    await new Promise(r => setTimeout(r, 500));
  }

  logger.info({ brand: brandKey, date: dateStr, count: players.length }, 'IDNS players with time fetched');
  return players;
}

/**
 * Keepalive — GET /dashboard untuk refresh session Laravel.
 *
 * @returns {{ ok: boolean, error?: string }}
 */
export async function keepaliveIdns(brandKey, domain, cookieHeader) {
  if (!cookieHeader) return { ok: false, error: 'no cookie' };

  try {
    await idnsFetch(`https://${domain}/dashboard`, cookieHeader);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
