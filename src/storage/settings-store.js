/**
 * Settings Store — key-value app settings (PostgreSQL)
 */

import { query, queryRows, queryOne } from './postgres.js';

export async function getSetting(key) {
  const row = await queryOne('SELECT value FROM settings WHERE key = $1', [key]);
  return row?.value ?? null;
}

export async function getAllSettings() {
  const rows = await queryRows('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export async function setSetting(key, value) {
  await query(`
    INSERT INTO settings (key, value, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `, [key, String(value)]);
}

export async function setSettings(obj) {
  for (const [key, value] of Object.entries(obj)) {
    await setSetting(key, value);
  }
}

export async function deleteSetting(key) {
  await query('DELETE FROM settings WHERE key = $1', [key]);
}

export async function initDefaultSettings() {
  const defaults = {
    tg_bot_token: process.env.TG_BOT_TOKEN || '',
    tg_report_group: process.env.TG_REPORT_GROUP || '',
    timezone: process.env.TZ || 'Asia/Phnom_Penh',
    cron_fetch: '0 1-23 * * *',
    cron_report: '5 1-23 * * *',
    cron_finish: '5 0 * * *',
  };

  for (const [key, value] of Object.entries(defaults)) {
    await query(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO NOTHING`, [key, value]);
  }
}
