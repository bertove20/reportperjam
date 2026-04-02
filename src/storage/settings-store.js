/**
 * Settings Store — tenant-scoped, module-scoped key-value
 */

import { query, queryRows, queryOne } from './postgres.js';

export async function getSetting(key, module = 'global', tenantId = 0) {
  const row = await queryOne(
    'SELECT value FROM settings WHERE key = $1 AND module = $2 AND (tenant_id = $3 OR tenant_id IS NULL) ORDER BY tenant_id DESC LIMIT 1',
    [key, module, tenantId]
  );
  return row?.value ?? null;
}

export async function getAllSettings(module = 'global', tenantId = 0) {
  const rows = await queryRows(
    'SELECT key, value FROM settings WHERE module = $1 AND (tenant_id = $2 OR tenant_id IS NULL) ORDER BY tenant_id DESC',
    [module, tenantId]
  );
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export async function getModuleSettings(module, tenantId = 0) {
  return getAllSettings(module, tenantId);
}

export async function setSetting(key, value, module = 'global', tenantId = 0) {
  await query(`
    INSERT INTO settings (key, module, tenant_id, value, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT(key, module, tenant_id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `, [key, module, tenantId, String(value)]);
}

export async function setSettings(obj, module = 'global', tenantId = 0) {
  for (const [key, value] of Object.entries(obj)) {
    await setSetting(key, value, module, tenantId);
  }
}

export async function deleteSetting(key, module = 'global', tenantId = 0) {
  await query('DELETE FROM settings WHERE key = $1 AND module = $2 AND tenant_id = $3', [key, module, tenantId]);
}

export async function initDefaultSettings() {
  // Only create defaults if no settings exist yet
  const existing = await queryOne("SELECT 1 FROM settings LIMIT 1");
  if (existing) return;

  const reportDefaults = {
    tg_bot_token: process.env.TG_BOT_TOKEN || '',
    tg_report_group: process.env.TG_REPORT_GROUP || '',
    timezone: process.env.TZ || 'Asia/Phnom_Penh',
    cron_fetch: '0 1-23 * * *',
    cron_report: '5 1-23 * * *',
    cron_finish: '5 0 * * *',
  };

  // Get default tenant
  const tenant = await queryOne("SELECT id FROM tenants WHERE slug = 'default'");
  const tid = tenant?.id || null;

  for (const [key, value] of Object.entries(reportDefaults)) {
    await query("INSERT INTO settings (key, module, tenant_id, value) VALUES ($1, 'report', $2, $3) ON CONFLICT DO NOTHING", [key, tid, value]);
  }
}
