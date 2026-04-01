/**
 * Test: ambil REGIS per jam dari /memberlist berdasarkan join_time
 * Usage: node --env-file=.env scripts/check-regis-hourly.js
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

async function fetchAllMembers(dateDDMMYYYY) {
  const members = [];
  let page = 1;

  while (true) {
    const res = await gotScraping.post(`https://${DOMAIN}/memberlist`, {
      json: {
        idus: USER_ID,
        filter: { fs: [dateDDMMYYYY, dateDDMMYYYY] },
        sort: { usnm: ['asc'] },
        limit: 200,
        page,
      },
      headers: { Cookie: cookie },
      headerGeneratorOptions: { browsers: [{ name: 'chrome', minVersion: 120 }], operatingSystems: ['macos'] },
      responseType: 'json',
      timeout: { request: 30000 },
    });

    const batch = res.body?.usls || [];
    members.push(...batch);
    if (batch.length < 200) break;
    page++;
    await new Promise(r => setTimeout(r, 500));
  }

  return members;
}

function parseHour(joinTime) {
  // Format: "30-03-2026 14:25:30" → hour 14
  const match = joinTime?.match(/(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1]);
}

async function main() {
  const testDate = '30-03-2026';
  console.log(`\nFetching all members for ${testDate}...\n`);

  const members = await fetchAllMembers(testDate);
  console.log(`Total members: ${members.length}\n`);

  // Count per hour (kumulatif)
  const hourCounts = new Array(24).fill(0);
  for (const m of members) {
    const h = parseHour(m.join_time);
    if (h !== null) hourCounts[h]++;
  }

  // Build kumulatif (seperti data bot)
  let cumulative = 0;
  console.log('JAM     | REGIS/JAM | KUMULATIF');
  console.log('--------|-----------|----------');
  for (let h = 0; h < 24; h++) {
    cumulative += hourCounts[h];
    const label = h === 0 ? 'FH (0)' : `${h}:00`;
    if (hourCounts[h] > 0 || cumulative > 0) {
      console.log(`${label.padEnd(8)}| ${String(hourCounts[h]).padStart(9)} | ${String(cumulative).padStart(8)}`);
    }
  }
  console.log(`--------|-----------|----------`);
  console.log(`FINISH  |           | ${String(cumulative).padStart(8)}`);

  // Verifikasi: ini harus match dengan data bot
  console.log(`\nTotal REGIS: ${cumulative}`);
  console.log(`Sample join_time: ${members[0]?.join_time} → hour ${parseHour(members[0]?.join_time)}`);
}

main().catch(console.error);
