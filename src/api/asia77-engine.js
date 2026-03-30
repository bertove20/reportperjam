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
 * Fetch data harian (TRX + basic stats)
 */
export async function fetchAsia77Daily(brandKey, domain, cookieHeaderParam = null) {
  const cookieHeader = getCookieHeader(brandKey, cookieHeaderParam);
  if (!cookieHeader) throw new Error(`No cookies for ${brandKey}`);

  const url = `https://${domain}/daily/info/list`;

  const response = await gotScraping.post(url, {
    json: { isNew: false },
    headers: { Cookie: cookieHeader },
    headerGeneratorOptions: {
      browsers: [{ name: 'chrome', minVersion: 120 }],
      operatingSystems: ['macos'],
    },
    responseType: 'json',
    timeout: { request: 30000 },
  });

  if (response.body?.ec !== 0) {
    throw new Error(`Asia77 API error: ec=${response.body?.ec}`);
  }

  return response.body.data;
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
