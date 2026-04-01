/**
 * Cek detail /memberlist response untuk tanggal lama
 * Usage: node --env-file=.env scripts/check-memberlist-detail.js
 */

import { gotScraping } from 'got-scraping';
import { readFileSync } from 'fs';

const DOMAIN = process.env.BRAND_E_DOMAIN || 'asia77cash.com';
const USER_ID = parseInt(process.env.BRAND_E_IDUS || '0');

function getCookieHeader() {
  const data = JSON.parse(readFileSync('data/cookies.json', 'utf8'));
  return data.BRAND_E?.cookieHeader || '';
}

const cookie = getCookieHeader();

async function fetchMemberlist(dateDDMMYYYY) {
  const res = await gotScraping.post(`https://${DOMAIN}/memberlist`, {
    json: {
      idus: USER_ID,
      filter: { fs: [dateDDMMYYYY, dateDDMMYYYY] },
      sort: { usnm: ['asc'] },
      limit: 200,
      page: 1,
    },
    headers: { Cookie: cookie },
    headerGeneratorOptions: { browsers: [{ name: 'chrome', minVersion: 120 }], operatingSystems: ['macos'] },
    responseType: 'json',
    timeout: { request: 30000 },
  });
  return res.body;
}

async function main() {
  const dates = ['31-03-2026', '30-03-2026', '29-03-2026', '25-03-2026', '01-03-2026'];

  for (const d of dates) {
    console.log(`\n═══ ${d} ═══`);
    const body = await fetchMemberlist(d);
    const members = body?.usls || [];
    console.log(`  usls count: ${members.length}`);
    console.log(`  Response keys: ${Object.keys(body || {}).join(', ')}`);
    if (members.length > 0) {
      console.log(`  First member keys: ${Object.keys(members[0]).join(', ')}`);
      console.log(`  First member: ${JSON.stringify(members[0]).slice(0, 200)}`);
    }
    // Kalau ada total field
    if (body?.ttldt !== undefined) console.log(`  ttldt: ${body.ttldt}`);
    if (body?.total !== undefined) console.log(`  total: ${body.total}`);
    if (body?.count !== undefined) console.log(`  count: ${body.count}`);
  }
}

main().catch(console.error);
