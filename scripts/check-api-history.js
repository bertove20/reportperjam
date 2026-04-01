/**
 * Cek apakah API panel bisa query data historical
 *
 * Test:
 *   1. /memberlist dengan tanggal lama → REGIS
 *   2. /daily/info/list dengan parameter date → TRX
 *
 * Usage: node --env-file=.env scripts/check-api-history.js
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
const headers = { Cookie: cookie };
const scrapeOpts = {
  headerGeneratorOptions: { browsers: [{ name: 'chrome', minVersion: 120 }], operatingSystems: ['macos'] },
  responseType: 'json',
  timeout: { request: 30000 },
};

async function testMemberlistHistory(dateDDMMYYYY, label) {
  console.log(`\n📋 /memberlist filter date=${dateDDMMYYYY} (${label})`);
  try {
    const res = await gotScraping.post(`https://${DOMAIN}/memberlist`, {
      json: {
        idus: USER_ID,
        filter: { fs: [dateDDMMYYYY, dateDDMMYYYY] },
        sort: { usnm: ['asc'] },
        limit: 5,
        page: 1,
      },
      headers,
      ...scrapeOpts,
    });
    const members = res.body?.usls || [];
    const total = res.body?.ttldt || members.length;
    console.log(`  ✅ Total: ${total} members (showing ${members.length})`);
    if (members.length > 0) {
      console.log(`  Sample: ${members[0]?.usnm || 'N/A'}`);
    }
    return total;
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return 0;
  }
}

async function testDailyInfoWithDate(dateParam, label) {
  console.log(`\n📊 /daily/info/list with date param: ${JSON.stringify(dateParam)} (${label})`);
  try {
    const res = await gotScraping.post(`https://${DOMAIN}/daily/info/list`, {
      json: dateParam,
      headers,
      ...scrapeOpts,
    });
    const body = res.body;
    if (body?.ec === 0) {
      const d = body.data;
      console.log(`  ✅ dpapp (today TRX): ${d.dpapp}`);
      console.log(`  ✅ yddpapp (yesterday TRX): ${d.yddpapp}`);
      console.log(`  ✅ mmb (members today): ${d.mmb}`);
      console.log(`  ✅ ydmmb (members yesterday): ${d.ydmmb}`);
      // Cek apakah ada field tanggal lain
      const keys = Object.keys(d);
      console.log(`  Fields: ${keys.join(', ')}`);
    } else {
      console.log(`  Response ec=${body?.ec}:`, JSON.stringify(body).slice(0, 300));
    }
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('🔍 Testing API History Capabilities');
  console.log(`  Domain: ${DOMAIN}`);
  console.log(`  User ID: ${USER_ID}`);
  console.log('═══════════════════════════════════════════');

  // 1. Test /memberlist with different dates
  await testMemberlistHistory('31-03-2026', 'Hari ini');
  await testMemberlistHistory('30-03-2026', 'Kemarin');
  await testMemberlistHistory('29-03-2026', '2 hari lalu');
  await testMemberlistHistory('25-03-2026', 'Minggu lalu');

  // 2. Test /daily/info/list with various params
  await testDailyInfoWithDate({ isNew: false }, 'Normal (tanpa date)');
  await testDailyInfoWithDate({ isNew: false, date: '30-03-2026' }, 'Dengan date string');
  await testDailyInfoWithDate({ isNew: false, dt: '30-03-2026' }, 'Dengan dt param');
  await testDailyInfoWithDate({ isNew: false, startDate: '30-03-2026', endDate: '30-03-2026' }, 'Dengan startDate/endDate');

  console.log('\n═══════════════════════════════════════════');
  console.log('Done!');
}

main().catch(console.error);
