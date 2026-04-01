/**
 * Alert System — kirim notifikasi error ke Telegram
 */

import { getSetting } from '../storage/settings-store.js';
import { logger } from '../logger.js';

/**
 * Kirim alert text ke Telegram group
 */
export async function sendAlert(message) {
  const token = getSetting('tg_bot_token') || process.env.TG_BOT_TOKEN;
  const groupId = getSetting('tg_report_group') || process.env.TG_REPORT_GROUP;

  if (!token || !groupId) {
    logger.warn('Alert: TG not configured, skipping');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: groupId,
        text: message,
        parse_mode: 'HTML',
      }),
    });
    const result = await response.json();
    if (!result.ok) {
      logger.error({ error: result.description }, 'Alert send failed');
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Alert send error');
  }
}

/**
 * Kirim alert untuk brand-brand yang error
 * @param {Array} errors - [{brand, error}]
 */
export async function sendFetchErrorAlert(errors, hour) {
  if (errors.length === 0) return;

  const lines = [
    `⚠️ <b>FETCH ERROR — Jam ${hour}:00</b>`,
    '',
    ...errors.map(e => `❌ <b>${e.brand}</b>: ${escapeHtml(e.error)}`),
    '',
    `Total: ${errors.length} brand gagal fetch`,
    '',
    `💡 Kemungkinan cookie expired. Login ulang via:`,
    `• Admin panel → Brands → Login`,
    `• Terminal: <code>node --env-file=.env scripts/login-brand.js</code>`,
  ];

  await sendAlert(lines.join('\n'));
}

function escapeHtml(text) {
  return text?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || '';
}
