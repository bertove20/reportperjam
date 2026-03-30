/**
 * Migration Script — Pindahkan config dari .env + cookies.json ke SQLite
 *
 * Usage: node --env-file=.env scripts/migrate-env-to-db.js
 *
 * Hanya perlu dijalankan SEKALI. Setelah ini, semua config dikelola via admin UI.
 */

import { readFileSync } from 'fs';
import { initDatabase } from '../src/storage/sqlite.js';
import { createBrand, getBrandByKey } from '../src/storage/brand-store.js';
import { setSettings, getSetting } from '../src/storage/settings-store.js';
import { getDb } from '../src/storage/sqlite.js';
import { hashPassword } from '../src/utils/auth-utils.js';
import { logger } from '../src/logger.js';

// Brand definitions dari .env (sama dengan brand-configs.js lama)
const ENV_BRANDS = [
  { envPrefix: 'BRAND_A', defaultKey: 'BRAND_A', defaultName: 'Brand A', engine: 'asia77', color: '#7c3aed' },
  { envPrefix: 'BRAND_B', defaultKey: 'BRAND_B', defaultName: 'Brand B', engine: 'asia77', color: '#059669' },
  { envPrefix: 'BRAND_C', defaultKey: 'BRAND_C', defaultName: 'Brand C', engine: 'asia77', color: '#d97706' },
  { envPrefix: 'BRAND_E', defaultKey: 'BRAND_E', defaultName: 'panen77', engine: 'asia77', color: '#dc2626' },
  { envPrefix: 'BRAND_D', defaultKey: 'BRAND_D', defaultName: 'Brand D', engine: 'syntech', color: '#0891b2' },
];

function loadCookies() {
  try {
    return JSON.parse(readFileSync('data/cookies.json', 'utf8'));
  } catch {
    return {};
  }
}

function loadLogo(brandKey) {
  try {
    const filename = `logo-${brandKey.toLowerCase().replace('_', '-')}.png`;
    const buffer = readFileSync(`assets/logos/${filename}`);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

async function main() {
  initDatabase();
  const cookies = loadCookies();

  logger.info('=== Migration: .env + cookies.json → SQLite ===');

  // 1. Migrate brands
  let brandCount = 0;
  for (const def of ENV_BRANDS) {
    const key = process.env[`${def.envPrefix}_KEY`] || def.defaultKey;
    const domain = process.env[`${def.envPrefix}_DOMAIN`];

    // Skip brand tanpa domain
    if (!domain || domain === 'panel-a.example.com' || domain === 'panel-b.example.com' ||
        domain === 'panel-c.example.com' || domain === 'panel-d.example.com' ||
        domain === 'panel-e.example.com') {
      logger.info({ key }, 'Skipped (no real domain)');
      continue;
    }

    // Skip jika sudah ada di DB
    if (getBrandByKey(key)) {
      logger.info({ key }, 'Already exists in DB, skipped');
      continue;
    }

    const brandData = {
      key,
      name: process.env[`${def.envPrefix}_NAME`] || def.defaultName,
      engine: process.env[`${def.envPrefix}_ENGINE`] || def.engine,
      domain,
      is_active: 1,
      sort_order: brandCount,
      primary_color: def.color,
      logo_base64: loadLogo(key),
    };

    if (brandData.engine === 'asia77') {
      brandData.user_id = parseInt(process.env[`${def.envPrefix}_IDUS`] || '0');
      brandData.cookie_header = cookies[key]?.cookieHeader || null;
    } else if (brandData.engine === 'syntech') {
      brandData.auth_user = process.env[`${def.envPrefix}_USER`] || null;
      brandData.auth_pass = process.env[`${def.envPrefix}_PASS`] || null;
      brandData.auth_pin = process.env[`${def.envPrefix}_PIN`] || null;
    }

    createBrand(brandData);
    brandCount++;
    logger.info({ key, name: brandData.name, engine: brandData.engine }, 'Brand migrated');
  }

  // 2. Migrate settings
  const settings = {
    tg_bot_token: process.env.TG_BOT_TOKEN || '',
    tg_report_group: process.env.TG_REPORT_GROUP || '',
    timezone: process.env.TZ || 'Asia/Phnom_Penh',
    cron_fetch: '0 1-23 * * *',
    cron_report: '5 1-23 * * *',
    cron_finish: '5 0 * * *',
  };
  setSettings(settings);
  logger.info('Settings migrated');

  // 3. Create default admin user
  const existingAdmin = getDb().prepare('SELECT id FROM admin_users WHERE username = ?').get('admin');
  if (!existingAdmin) {
    const hash = await hashPassword('admin');
    getDb().prepare(
      'INSERT INTO admin_users (username, password_hash) VALUES (?, ?)'
    ).run('admin', hash);
    logger.info('Default admin user created (username: admin, password: admin)');
  }

  logger.info(`=== Migration complete: ${brandCount} brands, settings, admin user ===`);
  process.exit(0);
}

main();
