/**
 * Referral Codes Routes — CRUD for (brand, referral_code) → division mapping
 */

import {
  listReferralCodes,
  getReferralCode,
  createReferralCode,
  updateReferralCode,
  deleteReferralCode,
} from '../storage/referral-store.js';

export default async function referralRoutes(app) {
  // GET /api/referrals?brand_key=&division_id=&active_only=true
  app.get('/api/referrals', async (request) => {
    const tid = request.tenantId;
    const { brand_key, division_id, active_only } = request.query;
    return listReferralCodes(tid, {
      brandKey: brand_key || null,
      divisionId: division_id ? parseInt(division_id) : null,
      activeOnly: active_only === 'true',
    });
  });

  // POST /api/referrals
  app.post('/api/referrals', async (request, reply) => {
    const tid = request.tenantId;
    const { brand_key, referral_code, division_id, display_name, is_active } = request.body || {};
    if (!brand_key || !referral_code) {
      return reply.code(400).send({ error: 'brand_key and referral_code are required' });
    }
    const row = await createReferralCode(tid, {
      brand_key,
      referral_code: referral_code.trim(),
      division_id: division_id ? parseInt(division_id) : null,
      display_name: display_name || null,
      is_active: is_active ?? 1,
    });
    return row;
  });

  // PUT /api/referrals/:id
  app.put('/api/referrals/:id', async (request, reply) => {
    const tid = request.tenantId;
    const id = parseInt(request.params.id);
    const existing = await getReferralCode(id, tid);
    if (!existing) return reply.code(404).send({ error: 'Referral code not found' });
    const updated = await updateReferralCode(id, tid, request.body || {});
    return updated;
  });

  // DELETE /api/referrals/:id
  app.delete('/api/referrals/:id', async (request, reply) => {
    const tid = request.tenantId;
    const id = parseInt(request.params.id);
    const existing = await getReferralCode(id, tid);
    if (!existing) return reply.code(404).send({ error: 'Referral code not found' });
    await deleteReferralCode(id, tid);
    return { success: true };
  });
}
