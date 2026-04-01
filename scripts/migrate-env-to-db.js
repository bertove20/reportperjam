/**
 * Migration Script — Setup multi-tenant database
 *
 * Usage: node --env-file=.env scripts/migrate-env-to-db.js
 */

import { initDatabase, query, queryOne } from '../src/storage/postgres.js';
import { hashPassword } from '../src/utils/auth-utils.js';
import { logger } from '../src/logger.js';

async function main() {
  await initDatabase();
  logger.info('=== Migration: Setup PostgreSQL ===');

  // 1. Get or create default tenant (created by initDatabase)
  let tenant = await queryOne("SELECT id FROM tenants WHERE slug = 'default'");
  if (!tenant) {
    const plan = await queryOne("SELECT id FROM plans WHERE name = 'Enterprise'");
    await query("INSERT INTO tenants (name, slug, plan_id) VALUES ('Default', 'default', $1)", [plan?.id || 1]);
    tenant = await queryOne("SELECT id FROM tenants WHERE slug = 'default'");
  }
  const tenantId = tenant.id;
  logger.info({ tenantId }, 'Default tenant ready');

  // 2. Create default division
  let div = await queryOne('SELECT id FROM divisions WHERE tenant_id = $1 LIMIT 1', [tenantId]);
  if (!div) {
    const result = await query('INSERT INTO divisions (name, tenant_id) VALUES ($1, $2) RETURNING id', ['Default', tenantId]);
    div = result.rows[0];
    logger.info('Default division created');
  }

  // 3. Create default superadmin (platform admin)
  const existingAdmin = await queryOne('SELECT id FROM users WHERE username = $1 AND tenant_id = $2', ['admin', tenantId]);
  if (!existingAdmin) {
    const hash = await hashPassword('admin');
    await query(
      'INSERT INTO users (username, password_hash, full_name, role, tenant_id, division_id, is_platform_admin) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['admin', hash, 'Super Admin', 'superadmin', tenantId, div.id, 1]
    );
    logger.info('Default admin user created (username: admin, password: admin)');
  } else {
    await query("UPDATE users SET is_platform_admin = 1 WHERE username = 'admin' AND tenant_id = $1", [tenantId]);
    logger.info('Admin user already exists');
  }

  // 4. Migrate settings (with tenant_id)
  const reportSettings = {
    tg_bot_token: process.env.TG_BOT_TOKEN || '',
    tg_report_group: process.env.TG_REPORT_GROUP || '',
    timezone: process.env.TZ || 'Asia/Phnom_Penh',
    cron_fetch: '0 1-23 * * *',
    cron_report: '5 1-23 * * *',
    cron_finish: '5 0 * * *',
  };

  for (const [key, value] of Object.entries(reportSettings)) {
    await query(
      "INSERT INTO settings (key, module, tenant_id, value) VALUES ($1, 'report', $2, $3) ON CONFLICT DO NOTHING",
      [key, tenantId, value]
    );
  }
  logger.info('Report settings migrated');

  const financeSettings = { tg_bot_token: '', tg_group_id: '', currency_default: 'IDR' };
  for (const [key, value] of Object.entries(financeSettings)) {
    await query(
      "INSERT INTO settings (key, module, tenant_id, value) VALUES ($1, 'finance', $2, $3) ON CONFLICT DO NOTHING",
      [key, tenantId, value]
    );
  }
  logger.info('Finance settings migrated');

  logger.info('=== Migration complete ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
