/**
 * Settings Routes — App configuration (PostgreSQL)
 */

import { getAllSettings, setSettings } from '../storage/settings-store.js';
import { sendTestMessage } from '../tim/tim-sender.js';

export default async function settingsRoutes(app) {
  app.get('/api/settings', async () => {
    const settings = await getAllSettings();
    if (settings.tg_bot_token) {
      const token = settings.tg_bot_token;
      settings.tg_bot_token_masked = token.slice(0, 8) + '...' + token.slice(-4);
    }
    return settings;
  });

  app.put('/api/settings', async (request) => {
    const data = request.body || {};
    const allowedKeys = ['tg_bot_token', 'tg_report_group', 'timezone', 'cron_fetch', 'cron_report', 'cron_finish'];
    const updates = {};
    for (const key of allowedKeys) {
      if (data[key] !== undefined) updates[key] = data[key];
    }
    if (Object.keys(updates).length > 0) await setSettings(updates);
    return { success: true, updated: Object.keys(updates) };
  });

  app.post('/api/settings/test-telegram', async (request, reply) => {
    const settings = await getAllSettings();
    const groupId = settings.tg_report_group;
    if (!groupId) return reply.code(400).send({ error: 'TG_REPORT_GROUP not configured' });

    try {
      const result = await sendTestMessage(groupId);
      if (result.ok) return { success: true, message: 'Test message sent' };
      return reply.code(500).send({ success: false, error: result.description });
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message });
    }
  });
}
