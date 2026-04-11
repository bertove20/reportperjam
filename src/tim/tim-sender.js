/**
 * Tim Report Sender — kirim foto ke Telegram
 *
 * Bot token dibaca dari database settings, fallback ke .env.
 */

import { getSetting } from '../storage/settings-store.js';
import { logger } from '../logger.js';

async function getBotToken(tenantId = null) {
  return await getSetting('tg_bot_token', 'report', tenantId) || process.env.TG_BOT_TOKEN;
}

/**
 * Kirim image sebagai document ke Telegram group.
 * Dipakai sebagai fallback kalau sendPhoto kena dimension limit.
 */
export async function sendDocument(chatId, pngBuffer, filename = 'report.png', caption = '', tenantId = null) {
  const token = await getBotToken(tenantId);
  if (!token) throw new Error('TG_BOT_TOKEN not configured');

  const url = `https://api.telegram.org/bot${token}/sendDocument`;
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('document', new Blob([pngBuffer], { type: 'image/png' }), filename);
  if (caption) formData.append('caption', caption);

  const response = await fetch(url, { method: 'POST', body: formData });
  const result = await response.json();
  if (!result.ok) {
    throw new Error(`Telegram sendDocument: ${result.description || 'unknown'} (code=${result.error_code})`);
  }
  return result;
}

/**
 * Kirim foto ke Telegram group.
 * Auto fallback ke sendDocument kalau kena PHOTO_INVALID_DIMENSIONS
 * (image terlalu tinggi/lebar — sum w+h > 10000 atau aspect ratio > 20:1).
 */
export async function sendPhoto(chatId, pngBuffer, caption = '', tenantId = null) {
  const token = await getBotToken(tenantId);
  if (!token) throw new Error('TG_BOT_TOKEN not configured');

  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('photo', new Blob([pngBuffer], { type: 'image/png' }), 'report.png');
      if (caption) formData.append('caption', caption);

      const response = await fetch(url, { method: 'POST', body: formData });
      const result = await response.json();

      if (result.ok) return result;

      lastError = `Telegram API: ${result.description || 'unknown error'} (code=${result.error_code})`;
      logger.warn({ chatId, attempt, error: lastError }, 'sendPhoto failed');

      // Dimension-related errors — sendPhoto tidak akan pernah sukses, langsung fallback.
      const desc = (result.description || '').toUpperCase();
      if (desc.includes('PHOTO_INVALID_DIMENSIONS') ||
          desc.includes('IMAGE_PROCESS_FAILED') ||
          desc.includes('PHOTO_SAVE_FILE_INVALID')) {
        logger.info({ chatId }, 'Falling back to sendDocument (image too large for sendPhoto)');
        return await sendDocument(chatId, pngBuffer, 'report.png', caption, tenantId);
      }

    } catch (err) {
      lastError = err.message;
      logger.warn({ chatId, attempt, err: err.message }, 'sendPhoto error');
    }

    if (attempt < 3) await new Promise(r => setTimeout(r, 10000));
  }

  logger.error({ chatId, lastError }, 'sendPhoto failed after 3 attempts');
  throw new Error(`sendPhoto failed: ${lastError}`);
}

/**
 * Test Telegram connection — kirim pesan teks
 */
export async function sendTestMessage(chatId, text = '✅ Test connection berhasil!', tenantId = null) {
  const token = await getBotToken(tenantId);
  if (!token) throw new Error('TG_BOT_TOKEN not configured');

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return response.json();
}
