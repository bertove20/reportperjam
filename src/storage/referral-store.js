/**
 * Referral Codes Store — mapping (brand, referral_code) → division
 */

import { query, queryRows, queryOne } from './postgres.js';

export async function listReferralCodes(tenantId, { brandKey = null, divisionId = null, activeOnly = false } = {}) {
  const conds = ['rc.tenant_id = $1'];
  const params = [tenantId];
  if (brandKey) { conds.push(`rc.brand_key = $${params.length + 1}`); params.push(brandKey); }
  if (divisionId) { conds.push(`rc.division_id = $${params.length + 1}`); params.push(divisionId); }
  if (activeOnly) conds.push('rc.is_active = 1');

  return queryRows(`
    SELECT rc.*, d.name AS division_name, d.tg_group_id AS division_tg_group
    FROM referral_codes rc
    LEFT JOIN divisions d ON d.id = rc.division_id
    WHERE ${conds.join(' AND ')}
    ORDER BY rc.brand_key, rc.referral_code
  `, params);
}

export async function getReferralCode(id, tenantId) {
  return queryOne('SELECT * FROM referral_codes WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
}

export async function createReferralCode(tenantId, data) {
  const result = await query(`
    INSERT INTO referral_codes (tenant_id, brand_key, referral_code, division_id, display_name, is_active)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT(tenant_id, brand_key, referral_code) DO UPDATE
      SET division_id = EXCLUDED.division_id,
          display_name = EXCLUDED.display_name,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
    RETURNING *
  `, [
    tenantId,
    data.brand_key,
    data.referral_code,
    data.division_id ?? null,
    data.display_name ?? null,
    data.is_active ?? 1,
  ]);
  return result.rows[0];
}

export async function updateReferralCode(id, tenantId, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  const allowed = ['brand_key', 'referral_code', 'division_id', 'display_name', 'is_active'];
  for (const f of allowed) {
    if (data[f] !== undefined) {
      fields.push(`${f} = $${idx++}`);
      values.push(data[f]);
    }
  }
  if (fields.length === 0) return getReferralCode(id, tenantId);
  fields.push('updated_at = NOW()');
  values.push(id, tenantId);
  await query(`UPDATE referral_codes SET ${fields.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx}`, values);
  return getReferralCode(id, tenantId);
}

export async function deleteReferralCode(id, tenantId) {
  await query('DELETE FROM referral_codes WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
}

/**
 * Get all referral codes grouped by division for daily report cycle
 * Returns: [{ division_id, division_name, tg_group_id, codes: [{brand_key, referral_code, display_name}, ...] }, ...]
 */
export async function getReferralsGroupedByDivision(tenantId) {
  const rows = await queryRows(`
    SELECT rc.*, d.name AS division_name, d.tg_group_id AS division_tg_group
    FROM referral_codes rc
    INNER JOIN divisions d ON d.id = rc.division_id
    WHERE rc.tenant_id = $1 AND rc.is_active = 1 AND d.is_active = 1
    ORDER BY d.name, rc.brand_key, rc.referral_code
  `, [tenantId]);

  const divMap = new Map();
  for (const r of rows) {
    if (!divMap.has(r.division_id)) {
      divMap.set(r.division_id, {
        division_id: r.division_id,
        division_name: r.division_name,
        tg_group_id: r.division_tg_group,
        codes: [],
      });
    }
    divMap.get(r.division_id).codes.push({
      brand_key: r.brand_key,
      referral_code: r.referral_code,
      display_name: r.display_name,
    });
  }
  return Array.from(divMap.values());
}
