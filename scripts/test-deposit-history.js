/**
 * Test fetch deposit history per jam
 * Usage: node --env-file=.env scripts/test-deposit-history.js
 */

import { gotScraping } from 'got-scraping';
import { queryOne, initDatabase } from '../src/storage/postgres.js';

await initDatabase();
const brand = await queryOne("SELECT cookie_header, domain, user_id FROM report_brands WHERE key = 'PANEN77'");

console.log('Domain:', brand.domain);
console.log('User ID:', brand.user_id);

// Fetch deposit history
const res = await gotScraping.post('https://' + brand.domain + '/trx/historypl', {
  json: {
    idusBr: brand.user_id,
    startdate: '02-04-2026',
    enddate: '02-04-2026',
    level: 5,
    page: 1,
    type: '1',       // 1 = Deposit
    limit: 500,
    bo: true,
    st: '10',         // 10 = Accepted
    mbids: [],         // empty = all banks
  },
  headers: { Cookie: brand.cookie_header },
  headerGeneratorOptions: { browsers: [{ name: 'chrome', minVersion: 120 }], operatingSystems: ['macos'] },
  responseType: 'json',
  timeout: { request: 30000 },
});

const body = res.body;
console.log('\nStatus:', res.statusCode);
console.log('Response type:', typeof body);

if (body?.dpls) {
  // dpls = deposit list
  console.log('Total deposits:', body.dpls.length);
  console.log('Total field:', body.ttldt);

  if (body.dpls.length > 0) {
    console.log('\nSample:', JSON.stringify(body.dpls[0]).slice(0, 300));

    // Parse per jam
    const hourCounts = new Array(24).fill(0);
    for (const dp of body.dpls) {
      // Cari field yang punya timestamp
      const dateStr = dp.crtm || dp.create_time || dp.date || dp.created_at || '';
      const match = dateStr.match(/(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        hourCounts[parseInt(match[1])]++;
      }
    }

    console.log('\nDeposit per jam:');
    let cumulative = 0;
    for (let h = 0; h < 24; h++) {
      cumulative += hourCounts[h];
      if (hourCounts[h] > 0) {
        console.log(`  ${String(h).padStart(2, '0')}:00 → ${hourCounts[h]} deposits (kumulatif: ${cumulative})`);
      }
    }
    console.log(`  TOTAL: ${cumulative}`);
  }
} else {
  console.log('Response:', JSON.stringify(body).slice(0, 500));
}

process.exit(0);
