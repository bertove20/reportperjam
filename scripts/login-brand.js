/**
 * Login Helper — Buka browser untuk login ke panel, auto-capture cookies
 *
 * Usage:
 *   node --env-file=.env scripts/login-brand.js              → login semua brand
 *   node --env-file=.env scripts/login-brand.js BRAND_E      → login 1 brand
 *
 * Flow:
 *   1. Buka browser (visible) ke halaman login panel
 *   2. Kamu login manual (handle Cloudflare, captcha, dll)
 *   3. Setelah masuk dashboard, tekan ENTER di terminal
 *   4. Script capture cookies (SESSION + cf_clearance) → simpan ke database
 *   5. Lanjut ke brand berikutnya
 */

import puppeteer from 'puppeteer';
import { initDatabase } from '../src/storage/sqlite.js';
import { getAllBrands, updateBrandCookie } from '../src/storage/brand-store.js';
import { logger } from '../src/logger.js';
import { createInterface } from 'readline';

function waitForEnter(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

async function loginBrand(brand) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🔐 LOGIN: ${brand.name} (${brand.key})`);
  console.log(`   Domain: ${brand.domain}`);
  console.log(`${'═'.repeat(60)}`);

  // Buka browser baru (visible, bukan headless)
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--window-size=1280,800',
    ],
    defaultViewport: { width: 1280, height: 800 },
    ...(process.env.PUPPETEER_EXECUTABLE_PATH && {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    }),
  });

  const page = await browser.newPage();

  // Set existing cookies jika ada (mungkin masih valid)
  if (brand.cookie_header) {
    const cookies = parseCookieHeader(brand.cookie_header, brand.domain);
    if (cookies.length > 0) {
      await page.setCookie(...cookies);
      console.log(`   ℹ️  Loaded ${cookies.length} existing cookies`);
    }
  }

  // Navigate ke panel
  console.log(`   🌐 Opening https://${brand.domain} ...`);
  try {
    await page.goto(`https://${brand.domain}`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
  } catch {
    console.log(`   ⚠️  Page load timeout — mungkin Cloudflare challenge`);
  }

  console.log(`\n   ✋ LOGIN MANUAL SEKARANG di browser yang terbuka!`);
  console.log(`   Setelah berhasil masuk dashboard, kembali ke terminal ini.`);
  await waitForEnter('   Tekan ENTER setelah login berhasil... ');

  // Capture cookies
  const allCookies = await page.cookies();
  const important = allCookies.filter(c =>
    c.name === 'SESSION' || c.name === 'cf_clearance' || c.name === 'activeLang'
  );

  if (important.length === 0) {
    console.log(`   ❌ Tidak ada cookie SESSION/cf_clearance ditemukan!`);
    console.log(`   Semua cookies: ${allCookies.map(c => c.name).join(', ')}`);
    await browser.close();
    return false;
  }

  // Build cookie header string
  const cookieHeader = important.map(c => `${c.name}=${c.value}`).join('; ');

  console.log(`\n   📦 Cookies captured:`);
  important.forEach(c => {
    const val = c.value.length > 30 ? c.value.slice(0, 30) + '...' : c.value;
    console.log(`      ${c.name} = ${val}`);
  });

  // Simpan ke database
  updateBrandCookie(brand.key, cookieHeader);
  console.log(`   ✅ Cookie saved to database for ${brand.key}`);

  // Test: coba akses /user/home
  try {
    await page.goto(`https://${brand.domain}/user/home`, {
      waitUntil: 'networkidle2',
      timeout: 15000,
    });
    const title = await page.title();
    console.log(`   🏠 Dashboard title: "${title}"`);
  } catch {
    console.log(`   ⚠️  Could not verify dashboard access`);
  }

  await browser.close();
  console.log(`   ✅ Done — browser closed\n`);
  return true;
}

function parseCookieHeader(header, domain) {
  return header.split(';').map(c => {
    const [name, ...rest] = c.trim().split('=');
    return {
      name: name.trim(),
      value: rest.join('=').trim(),
      domain: `.${domain}`,
      path: '/',
    };
  }).filter(c => c.name && c.value);
}

async function main() {
  initDatabase();

  const targetKey = process.argv[2]; // optional: BRAND_E
  const allBrands = getAllBrands(true);

  if (allBrands.length === 0) {
    console.log('❌ Tidak ada brand aktif di database. Tambah brand dulu via admin panel.');
    process.exit(1);
  }

  const brands = targetKey
    ? allBrands.filter(b => b.key === targetKey)
    : allBrands.filter(b => b.engine === 'asia77'); // Hanya asia77 yang butuh cookie

  if (brands.length === 0) {
    console.log(`❌ Brand ${targetKey || 'asia77'} tidak ditemukan.`);
    console.log(`   Available: ${allBrands.map(b => b.key).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n🔐 Login Helper — ${brands.length} brand(s) to login`);
  console.log(`   Brands: ${brands.map(b => `${b.name} (${b.key})`).join(', ')}`);
  console.log(`\n   Setiap brand akan buka browser baru.`);
  console.log(`   Login manual, lalu tekan ENTER di terminal.\n`);

  let success = 0;
  for (const brand of brands) {
    const ok = await loginBrand(brand);
    if (ok) success++;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ Selesai: ${success}/${brands.length} brand berhasil login`);
  console.log(`${'═'.repeat(60)}\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
