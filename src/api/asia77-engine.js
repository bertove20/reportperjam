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
 * Keepalive — panggil setiap 15 menit supaya session tidak expire
 */
export async function keepaliveAsia77(brandKey, domain, cookieHeaderParam = null) {
  const cookieHeader = getCookieHeader(brandKey, cookieHeaderParam);
  if (!cookieHeader) return false;

  try {
    const response = await gotScraping.get(`https://${domain}/clearMessage`, {
      headers: { Cookie: cookieHeader },
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 120 }],
        operatingSystems: ['macos'],
      },
      timeout: { request: 15000 },
    });
    return response.statusCode === 200;
  } catch {
    return false;
  }
}
