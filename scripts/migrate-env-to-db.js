/**
 * Migration Script — Setup database + default admin user + default division
 *
 * Usage: node --env-file=.env scripts/migrate-env-to-db.js
 */

import { initDatabase, query, queryOne } from '../src/storage/postgres.js';
import { setSettings } from '../src/storage/settings-store.js';
import { hashPassword } from '../src/utils/auth-utils.js';
import { logger } from '../src/logger.js';

async function main() {
  await initDatabase();
  logger.info('=== Migration: Setup PostgreSQL ===');

  // 1. Create default division
  const existingDiv = await queryOne('SELECT id FROM divisions WHERE name = $1', ['Default']);
  let divisionId;
  if (!existingDiv) {
    const result = await query('INSERT INTO divisions (name, description) VALUES ($1, $2) RETURNING id', ['Default', 'Default division']);
    divisionId = result.rows[0].id;
    logger.info('Default division created');
  } else {
    divisionId = existingDiv.id;
  }

  // 2. Create default superadmin
  const existingAdmin = await queryOne('SELECT id FROM users WHERE username = $1', ['admin']);
  if (!existingAdmin) {
    const hash = await hashPassword('admin');
    await query(
      'INSERT INTO users (username, password_hash, full_name, role, division_id) VALUES ($1, $2, $3, $4, $5)',
      ['admin', hash, 'Super Admin', 'superadmin', divisionId]
    );
    logger.info('Default admin user created (username: admin, password: admin)');
  } else {
    // Ensure role column exists and is set
    await query("UPDATE users SET role = 'superadmin' WHERE username = 'admin' AND (role IS NULL OR role = '')").catch(() => {});
    logger.info('Admin user already exists');
  }

  // 3. Migrate settings
  const reportSettings = {
    tg_bot_token: process.env.TG_BOT_TOKEN || '',
    tg_report_group: process.env.TG_REPORT_GROUP || '',
    timezone: process.env.TZ || 'Asia/Phnom_Penh',
    cron_fetch: '0 1-23 * * *',
    cron_report: '5 1-23 * * *',
    cron_finish: '5 0 * * *',
  };
  await setSettings(reportSettings, 'report');
  logger.info('Report settings migrated');

  const financeSettings = {
    tg_bot_token: '',
    tg_group_id: '',
    currency_default: 'IDR',
  };
  await setSettings(financeSettings, 'finance');
  logger.info('Finance settings migrated');

  logger.info('=== Migration complete ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
