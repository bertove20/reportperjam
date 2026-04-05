/**
 * Settings Routes — Module-scoped app configuration (PostgreSQL)
 */

import { getAllSettings, setSettings, getModuleSettings } from '../storage/settings-store.js';
import { sendTestMessage } from '../tim/tim-sender.js';
import { tWhere } from '../middleware/tenant-scope.js';

export default async function settingsRoutes(app) {
  // GET /api/settings?module=report
  app.get('/api/settings', async (request) => {
    const tid = request.tenantId;
    const module = request.query.module || 'report';
    const settings = await getModuleSettings(module, tid);

    // Mask bot tokens
    if (settings.tg_bot_token) {
      const token = settings.tg_bot_token;
      settings.tg_bot_token_masked = token.length > 12
        ? token.slice(0, 8) + '...' + token.slice(-4)
        : '(empty)';
    }
    return { module, ...settings };
  });

  // PUT /api/settings
  app.put('/api/settings', async (request) => {
    const tid = request.tenantId;
    const { module: mod = 'report', ...data } = request.body || {};

    const allowedKeys = [
      'tg_bot_token', 'tg_report_group', 'tg_group_id',
      'timezone', 'cron_fetch', 'cron_report', 'cron_finish',
      'currency_default',
    ];

    const updates = {};
    for (const key of allowedKeys) {
      if (data[key] !== undefined) updates[key] = data[key];
    }

    if (Object.keys(updates).length > 0) {
      await setSettings(updates, mod, tid);
    }

    return { success: true, module: mod, updated: Object.keys(updates) };
  });

  // POST /api/settings/test-telegram?module=report
  app.post('/api/settings/test-telegram', async (request, reply) => {
    const tid = request.tenantId;
    const module = request.query.module || request.body?.module || 'report';
    const settings = await getModuleSettings(module, tid);
    const groupId = settings.tg_report_group || settings.tg_group_id;

    if (!groupId) return reply.code(400).send({ error: 'Telegram group not configured for this module' });

    try {
      const result = await sendTestMessage(groupId, undefined, tid);
      if (result.ok) return { success: true, message: `Test message sent (${module})` };
      return reply.code(500).send({ success: false, error: result.description });
    } catch (err) {
      return reply.code(500).send({ success: false, error: err.message });
    }
  });
}
