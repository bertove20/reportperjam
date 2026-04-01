/**
 * Cek WebSocket connections di panel asia77
 *
 * Usage: node --env-file=.env scripts/check-websocket.js
 */

import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';

const DOMAIN = process.env.BRAND_E_DOMAIN || 'asia77cash.com';

// Baca cookies dari DB atau file
function getCookies() {
  try {
    const data = JSON.parse(readFileSync('data/cookies.json', 'utf8'));
    const header = data.BRAND_E?.cookieHeader || '';
    // Parse "SESSION=xxx; cf_clearance=yyy" → array of cookie objects
    return header.split(';').map(c => {
      const [name, ...rest] = c.trim().split('=');
      return {
        name: name.trim(),
        value: rest.join('=').trim(),
        domain: `.${DOMAIN}`,
        path: '/',
      };
    }).filter(c => c.name && c.value);
  } catch {
    return [];
  }
}

async function main() {
  console.log(`\n🔍 Checking WebSocket on https://${DOMAIN} ...\n`);

  const browser = await puppeteer.launch({
    headless: false,  // Tampilkan browser supaya bisa lihat
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // Set cookies
  const cookies = getCookies();
  if (cookies.length > 0) {
    await page.setCookie(...cookies);
    console.log(`✅ ${cookies.length} cookies set`);
  } else {
    console.log('⚠️  No cookies found — mungkin perlu login manual');
  }

  // Track semua WebSocket connections
  const wsConnections = [];
  const wsMessages = [];

  // Listen for WebSocket creation via CDP
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');

  cdp.on('Network.webSocketCreated', (params) => {
    console.log(`\n🔌 WebSocket CREATED: ${params.url}`);
    wsConnections.push({ url: params.url, id: params.requestId });
  });

  cdp.on('Network.webSocketFrameReceived', (params) => {
    const data = params.response?.payloadData || '';
    const preview = data.length > 200 ? data.slice(0, 200) + '...' : data;
    console.log(`📥 WS RECEIVED [${params.requestId}]: ${preview}`);
    wsMessages.push({ type: 'received', id: params.requestId, data });
  });

  cdp.on('Network.webSocketFrameSent', (params) => {
    const data = params.response?.payloadData || '';
    const preview = data.length > 200 ? data.slice(0, 200) + '...' : data;
    console.log(`📤 WS SENT [${params.requestId}]: ${preview}`);
    wsMessages.push({ type: 'sent', id: params.requestId, data });
  });

  cdp.on('Network.webSocketClosed', (params) => {
    console.log(`❌ WS CLOSED [${params.requestId}]`);
  });

  // Juga track XHR/Fetch requests
  const apiRequests = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes(DOMAIN) && !url.includes('.css') && !url.includes('.js') && !url.includes('.png') && !url.includes('.jpg')) {
      const status = response.status();
      apiRequests.push({ url, status });
    }
  });

  // Navigate ke panel
  console.log(`\n🌐 Navigating to https://${DOMAIN}/user/home ...`);
  try {
    await page.goto(`https://${DOMAIN}/user/home`, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('✅ Page loaded');
  } catch (err) {
    console.log('⚠️  Page load timeout (mungkin Cloudflare block):', err.message);
  }

  // Tunggu 15 detik untuk observe WebSocket traffic
  console.log('\n⏳ Menunggu 15 detik untuk observe WebSocket & API traffic...\n');
  await new Promise(r => setTimeout(r, 15000));

  // Summary
  console.log('\n═══════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════');
  console.log(`WebSocket connections: ${wsConnections.length}`);
  wsConnections.forEach(ws => console.log(`  🔌 ${ws.url}`));
  console.log(`WebSocket messages: ${wsMessages.length}`);
  console.log(`API requests captured: ${apiRequests.length}`);
  apiRequests.slice(0, 20).forEach(r => console.log(`  ${r.status} ${r.url}`));

  if (wsConnections.length > 0) {
    console.log('\n✅ WebSocket DITEMUKAN! Data bisa di-stream real-time.');
  } else {
    console.log('\n❌ Tidak ada WebSocket. Panel hanya pakai HTTP requests biasa.');
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch(console.error);
