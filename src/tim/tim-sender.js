/**
 * Tim Report Sender — kirim foto ke Telegram
 *
 * Bot token dibaca dari database settings, fallback ke .env.
 */

import { getSetting } from '../storage/settings-store.js';
import { logger } from '../logger.js';

function getBotToken() {
  return getSetting('tg_bot_token') || process.env.TG_BOT_TOKEN;
}

/**
 * Kirim foto ke Telegram group
 */
export async function sendPhoto(chatId, pngBuffer, caption = '') {
  const token = getBotToken();
  if (!token) throw new Error('TG_BOT_TOKEN not configured');

  const url = `https://api.telegram.org/bot${token}/sendPhoto`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('photo', new Blob([pngBuffer], { type: 'image/png' }), 'report.png');
      if (caption) formData.append('caption', caption);

      const response = await fetch(url, { method: 'POST', body: formData });
      const result = await response.json();

      if (result.ok) return result;

      logger.warn({ chatId, attempt, error: result.description }, 'sendPhoto failed');

    } catch (err) {
      logger.warn({ chatId, attempt, err: err.message }, 'sendPhoto error');
    }

    if (attempt < 3) await new Promise(r => setTimeout(r, 10000));
  }

  logger.error({ chatId }, 'sendPhoto failed after 3 attempts');
}

/**
 * Test Telegram connection — kirim pesan teks
 */
export async function sendTestMessage(chatId, text = '✅ Test connection berhasil!') {
  const token = getBotToken();
  if (!token) throw new Error('TG_BOT_TOKEN not configured');

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return response.json();
}
