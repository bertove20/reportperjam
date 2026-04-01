/**
 * Migration Script — Setup database + default admin user
 *
 * Usage: node --env-file=.env scripts/migrate-env-to-db.js
 */

import { initDatabase, query, queryOne } from '../src/storage/postgres.js';
import { createBrand, getBrandByKey } from '../src/storage/brand-store.js';
import { setSettings } from '../src/storage/settings-store.js';
import { hashPassword } from '../src/utils/auth-utils.js';
import { logger } from '../src/logger.js';

async function main() {
  await initDatabase();

  logger.info('=== Migration: Setup PostgreSQL ===');

  // 1. Migrate settings
  const settings = {
    tg_bot_token: process.env.TG_BOT_TOKEN || '',
    tg_report_group: process.env.TG_REPORT_GROUP || '',
    timezone: process.env.TZ || 'Asia/Phnom_Penh',
    cron_fetch: '0 1-23 * * *',
    cron_report: '5 1-23 * * *',
    cron_finish: '5 0 * * *',
  };
  await setSettings(settings);
  logger.info('Settings migrated');

  // 2. Create default admin user
  const existingAdmin = await queryOne('SELECT id FROM admin_users WHERE username = $1', ['admin']);
  if (!existingAdmin) {
    const hash = await hashPassword('admin');
    await query('INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)', ['admin', hash]);
    logger.info('Default admin user created (username: admin, password: admin)');
  } else {
    logger.info('Admin user already exists');
  }

  logger.info('=== Migration complete ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
