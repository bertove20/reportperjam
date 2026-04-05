/**
 * Referral Codes Routes — CRUD for (brand, referral_code) → division mapping
 */

import {
  listReferralCodes,
  getReferralCode,
  createReferralCode,
  updateReferralCode,
  deleteReferralCode,
  getReferralMonthlyBreakdown,
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
    const { brand_key, referral_code, division_id, display_name, referral_type, is_active } = request.body || {};
    if (!brand_key || !referral_code) {
      return reply.code(400).send({ error: 'brand_key and referral_code are required' });
    }
    const row = await createReferralCode(tid, {
      brand_key,
      referral_code: referral_code.trim(),
      division_id: division_id ? parseInt(division_id) : null,
      display_name: display_name || null,
      referral_type: referral_type || null,
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

  // GET /api/referrals/dashboard?division_id=X&date=YYYY-MM-DD
  // Returns monthly breakdown (one entry per brand+referral) for dashboard view.
  app.get('/api/referrals/dashboard', async (request, reply) => {
    const tid = request.tenantId;
    const { division_id, date } = request.query;
    if (!division_id) return reply.code(400).send({ error: 'division_id is required' });

    const targetDate = date || new Date().toISOString().slice(0, 10);
    const data = await getReferralMonthlyBreakdown(tid, parseInt(division_id), targetDate);
    return { division_id: parseInt(division_id), target_date: targetDate, items: data };
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
