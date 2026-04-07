/**
 * ENGINE TYPE A: Asia77 — Cookie-based Authentication
 *
 * Cookie bisa dari parameter (DB) atau dari file cookies.json (legacy).
 */

import { gotScraping } from 'got-scraping';
import { readFileSync } from 'fs';
import { logger } from '../logger.js';

/**
 * Baca cookie — prioritas: parameter > cookies.json file
 */
function getCookieHeader(brandKey, cookieHeaderParam) {
  if (cookieHeaderParam) return cookieHeaderParam;

  try {
    const cookies = JSON.parse(readFileSync('data/cookies.json', 'utf8'));
    return cookies[brandKey]?.cookieHeader || null;
  } catch {
    return null;
  }
}

/**
 * Validasi API response — detect Cloudflare block, session expired, dll
 */
function validateResponse(response, brandKey) {
  const body = response.body;

  // Response bukan JSON (Cloudflare challenge page)
  if (typeof body === 'string') {
    if (body.includes('cf-challenge') || body.includes('cloudflare')) {
      throw new Error(`Cloudflare block — cookie expired, perlu login ulang`);
    }
    if (body.includes('login') || body.includes('Login')) {
      throw new Error(`Session expired — redirect ke login, perlu login ulang`);
    }
    throw new Error(`Response bukan JSON — kemungkinan cookie expired`);
  }

  // ec = -1 atau undefined
  if (body?.ec === -1) {
    throw new Error(`Session expired (ec=-1) — perlu login ulang`);
  }
  if (body?.ec === undefined || body?.ec === null) {
    throw new Error(`Cookie expired (ec=undefined) — perlu login ulang`);
  }
  if (body?.ec !== 0) {
    throw new Error(`API error: ec=${body.ec}, msg=${body.msg || 'unknown'}`);
  }

  return body;
}

/**
 * Fetch data harian (TRX + basic stats)
 */
export async function fetchAsia77Daily(brandKey, domain, cookieHeaderParam = null) {
  const cookieHeader = getCookieHeader(brandKey, cookieHeaderParam);
  if (!cookieHeader) throw new Error(`No cookies for ${brandKey} — perlu login`);

  const url = `https://${domain}/daily/info/list`;

  let response;
  try {
    response = await gotScraping.post(url, {
      json: { isNew: false },
      headers: { Cookie: cookieHeader },
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 120 }],
        operatingSystems: ['macos'],
      },
      responseType: 'json',
      timeout: { request: 30000 },
    });
  } catch (err) {
    // Network error, timeout, dll
    if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout')) {
      throw new Error(`Panel ${domain} timeout — server mungkin down`);
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      throw new Error(`Panel ${domain} tidak bisa diakses — cek domain/internet`);
    }
    throw err;
  }

  const body = validateResponse(response, brandKey);
  return body.data;
}

/**
 * Fetch registrasi via /memberlist (dengan pagination)
 */
export async function fetchAsia77Regis(brandKey, domain, dateDDMMYYYY, userId, cookieHeaderParam = null) {
  const cookieHeader = getCookieHeader(brandKey, cookieHeaderParam);
  if (!cookieHeader) throw new Error(`No cookies for ${brandKey}`);

  const url = `https://${domain}/memberlist`;
  let total = 0;
  let page = 1;
  const limit = 200;

  while (true) {
    const response = await gotScraping.post(url, {
      json: {
        idus: userId,
        filter: { fs: [dateDDMMYYYY, dateDDMMYYYY] },
        sort: { usnm: ['asc'] },
        limit,
        page,
      },
      headers: { Cookie: cookieHeader },
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 120 }],
        operatingSystems: ['macos'],
      },
      responseType: 'json',
      timeout: { request: 30000 },
    });

    const members = response.body?.usls || [];
    total += members.length;

    if (members.length < limit) break;
    page++;

    await new Promise(r => setTimeout(r, 500));
  }

  return total;
}

/**
 * Fetch SEMUA member dengan join_time (full pagination)
 */
export async function fetchAllMembersWithTime(brandKey, domain, dateDDMMYYYY, userId, cookieHeaderParam = null) {
  const cookieHeader = getCookieHeader(brandKey, cookieHeaderParam);
  if (!cookieHeader) throw new Error(`No cookies for ${brandKey}`);

  const url = `https://${domain}/memberlist`;
  const members = [];
  let page = 1;
  const limit = 200;

  while (true) {
    const response = await gotScraping.post(url, {
      json: {
        idus: userId,
        filter: { fs: [dateDDMMYYYY, dateDDMMYYYY] },
        sort: { usnm: ['asc'] },
        limit,
        page,
      },
      headers: { Cookie: cookieHeader },
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 120 }],
        operatingSystems: ['macos'],
      },
      responseType: 'json',
      timeout: { request: 30000 },
    });

    const batch = response.body?.usls || [];
    members.push(...batch);

    if (batch.length < limit) break;
    page++;
    await new Promise(r => setTimeout(r, 500));
  }

  return members;
}

/**
 * Fetch member list dengan filter newmb + refusnm + date range.
 * Untuk referral report harian: group by referral → count per brand per referral.
 *
 * @param {string} brandKey
 * @param {string} domain
 * @param {number} userId — idus
 * @param {Object} opts
 * @param {string} opts.dateDDMMYYYY — filter.fs [date, date]
 * @param {boolean} opts.newmb — true = Filter By New Member, false = Non New Member, null = All
 * @param {Array<string>} [opts.referralCodes] — filter.refusnm, empty/undefined = tidak difilter
 * @param {string} [opts.cookieHeader]
 * @returns {Array} member objects
 */
export async function fetchMembersFiltered(brandKey, domain, userId, opts) {
  const { dateDDMMYYYY, newmb, referralCodes, cookieHeader: cookieHeaderParam } = opts;
  const cookieHeader = getCookieHeader(brandKey, cookieHeaderParam);
  if (!cookieHeader) throw new Error(`No cookies for ${brandKey}`);

  const url = `https://${domain}/memberlist`;
  const members = [];
  let page = 1;
  const limit = 200;

  const filter = { fs: [dateDDMMYYYY, dateDDMMYYYY] };
  if (newmb === true) filter.newmb = [true];
  else if (newmb === false) filter.nonnewmb = [true];
  if (referralCodes && referralCodes.length > 0) filter.refusnm = referralCodes;

  while (true) {
    const response = await gotScraping.post(url, {
      json: {
        idus: userId,
        filter,
        sort: { usnm: ['asc'] },
        limit,
        page,
      },
      headers: { Cookie: cookieHeader },
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 120 }],
        operatingSystems: ['macos'],
      },
      responseType: 'json',
      timeout: { request: 30000 },
    });

    const body = validateResponse(response, brandKey);
    const batch = body?.usls || [];
    members.push(...batch);

    if (batch.length < limit) break;
    page++;
    await new Promise(r => setTimeout(r, 500));
  }

  return members;
}

/**
 * Fetch deposit history (accepted) untuk satu tanggal — dengan pagination
 * Dipakai untuk backfill TRX per jam dari data historis
 * @returns {Array} [{rcdtm, amt, ...}, ...]
 */
export async function fetchAsia77DepositHistory(brandKey, domain, dateDDMMYYYY, userId, cookieHeaderParam = null) {
  const cookieHeader = getCookieHeader(brandKey, cookieHeaderParam);
  if (!cookieHeader) throw new Error(`No cookies for ${brandKey}`);

  const url = `https://${domain}/trx/historypl`;
  const deposits = [];
  let page = 1;
  const limit = 500;

  while (true) {
    const response = await gotScraping.post(url, {
      json: {
        idusBr: userId,
        startdate: dateDDMMYYYY,
        enddate: dateDDMMYYYY,
        level: 5,
        usernameBr: '',
        page,
        type: '1',
        mbids: ['1','2','3','4','5','6','7','8','9','10','11','12','13','14','16','49','50','82','83','115','148','149','150','151','152','153','181'],
        limit,
        bo: true,
        st: '10',
      },
      headers: {
        Cookie: cookieHeader,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `https://${domain}/dp/history`,
      },
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 120 }],
        operatingSystems: ['macos'],
      },
      responseType: 'json',
      timeout: { request: 30000 },
    });

    const batch = response.body?.trx || [];
    deposits.push(...batch);

    if (batch.length < limit) break;
    page++;
    await new Promise(r => setTimeout(r, 500));
  }

  return deposits;
}

/**
 * Keepalive — panggil setiap 15 menit supaya session tidak expire
 * Panggil 2 endpoint: /clearMessage + /sse/user/balance
 * untuk memastikan session benar-benar aktif di sisi panel.
 *
 * @returns {{ ok: boolean, error?: string }}
 */
export async function keepaliveAsia77(brandKey, domain, cookieHeaderParam = null, userId = 0) {
  const cookieHeader = getCookieHeader(brandKey, cookieHeaderParam);
  if (!cookieHeader) return { ok: false, error: 'no cookie' };

  const hgOpts = {
    browsers: [{ name: 'chrome', minVersion: 120 }],
    operatingSystems: ['macos'],
  };

  try {
    // 1. clearMessage (ringan — menjaga session di cache)
    await gotScraping.get(`https://${domain}/clearMessage`, {
      headers: { Cookie: cookieHeader },
      headerGeneratorOptions: hgOpts,
      timeout: { request: 15000 },
    });

    // 2. /sse/user/balance (berat — trigger session refresh seperti browser nyata)
    const balResp = await gotScraping.post(`https://${domain}/sse/user/balance`, {
      json: { userId: userId || 0, force: false },
      headers: { Cookie: cookieHeader },
      headerGeneratorOptions: hgOpts,
      responseType: 'json',
      timeout: { request: 15000 },
    });

    const body = balResp.body;
    if (body?.ecErr === 0 || body?.ec === 0) {
      return { ok: true };
    }
    // Session masih hidup tapi mungkin ada warning
    if (typeof body === 'object' && body !== null) {
      return { ok: true };
    }

    return { ok: false, error: `Unexpected response: ${typeof body === 'string' ? body.slice(0, 100) : JSON.stringify(body).slice(0, 100)}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
