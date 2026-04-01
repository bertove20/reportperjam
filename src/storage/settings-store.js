/**
 * Settings Store — module-scoped key-value (PostgreSQL)
 *
 * Settings now have a `module` scope:
 *   'global'  — shared settings
 *   'report'  — Report Bot telegram, schedule
 *   'finance' — Finance telegram, preferences
 */

import { query, queryRows, queryOne } from './postgres.js';

export async function getSetting(key, module = 'global') {
  // Try module-specific first, fallback to global
  const row = await queryOne('SELECT value FROM settings WHERE key = $1 AND module = $2', [key, module]);
  if (row) return row.value;
  if (module !== 'global') {
    const global = await queryOne('SELECT value FROM settings WHERE key = $1 AND module = $2', [key, 'global']);
    return global?.value ?? null;
  }
  return null;
}

export async function getAllSettings(module = 'global') {
  const rows = await queryRows('SELECT key, value FROM settings WHERE module = $1', [module]);
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export async function getModuleSettings(module) {
  return getAllSettings(module);
}

export async function setSetting(key, value, module = 'global') {
  await query(`
    INSERT INTO settings (key, module, value, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT(key, module) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `, [key, module, String(value)]);
}

export async function setSettings(obj, module = 'global') {
  for (const [key, value] of Object.entries(obj)) {
    await setSetting(key, value, module);
  }
}

export async function deleteSetting(key, module = 'global') {
  await query('DELETE FROM settings WHERE key = $1 AND module = $2', [key, module]);
}

export async function initDefaultSettings() {
  // Report module defaults
  const reportDefaults = {
    tg_bot_token: process.env.TG_BOT_TOKEN || '',
    tg_report_group: process.env.TG_REPORT_GROUP || '',
    timezone: process.env.TZ || 'Asia/Phnom_Penh',
    cron_fetch: '0 1-23 * * *',
    cron_report: '5 1-23 * * *',
    cron_finish: '5 0 * * *',
  };

  for (const [key, value] of Object.entries(reportDefaults)) {
    await query(`INSERT INTO settings (key, module, value) VALUES ($1, 'report', $2) ON CONFLICT(key, module) DO NOTHING`, [key, value]);
  }

  // Finance module defaults
  const financeDefaults = {
    tg_bot_token: '',
    tg_group_id: '',
    currency_default: 'IDR',
  };

  for (const [key, value] of Object.entries(financeDefaults)) {
    await query(`INSERT INTO settings (key, module, value) VALUES ($1, 'finance', $2) ON CONFLICT(key, module) DO NOTHING`, [key, value]);
  }
}
