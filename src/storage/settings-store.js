/**
 * Settings Store — key-value app settings
 */

import { getDb } from './sqlite.js';

export function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

export function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export function setSetting(key, value) {
  getDb().prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, String(value));
}

export function setSettings(obj) {
  const stmt = getDb().prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);

  const transaction = getDb().transaction((entries) => {
    for (const [key, value] of entries) {
      stmt.run(key, String(value));
    }
  });

  transaction(Object.entries(obj));
}

export function deleteSetting(key) {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
}

/**
 * Initialize default settings jika belum ada
 */
export function initDefaultSettings() {
  const defaults = {
    tg_bot_token: process.env.TG_BOT_TOKEN || '',
    tg_report_group: process.env.TG_REPORT_GROUP || '',
    timezone: process.env.TZ || 'Asia/Phnom_Penh',
    cron_fetch: '0 1-23 * * *',
    cron_report: '5 1-23 * * *',
    cron_finish: '5 0 * * *',
  };

  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);

  const transaction = getDb().transaction(() => {
    for (const [key, value] of Object.entries(defaults)) {
      stmt.run(key, value);
    }
  });

  transaction();
}
