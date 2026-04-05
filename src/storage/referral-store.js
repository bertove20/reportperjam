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
 * Upsert daily snapshot (used after each report cycle to keep history)
 */
export async function upsertReferralDailySnapshot(tenantId, divisionId, brandKey, referralCode, date, newRegis, depoRegis) {
  await query(`
    INSERT INTO referral_daily_snapshots
      (tenant_id, division_id, brand_key, referral_code, date, new_regis, depo_regis, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (tenant_id, division_id, brand_key, referral_code, date)
    DO UPDATE SET
      new_regis = EXCLUDED.new_regis,
      depo_regis = EXCLUDED.depo_regis,
      updated_at = NOW()
  `, [tenantId, divisionId, brandKey, referralCode, date, newRegis, depoRegis]);
}

/**
 * Get 30-day trend for a division — one row per date with totals across
 * all brands and referrals in that division.
 * Returns: [{ date, new_regis, depo_regis }, ...] sorted by date ASC
 */
export async function getDivisionTrend(tenantId, divisionId, endDate, days = 30) {
  // Get start date = endDate - (days-1)
  const end = new Date(endDate + 'T00:00:00Z');
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startStr = start.toISOString().slice(0, 10);

  return queryRows(`
    SELECT date,
           SUM(new_regis)::int AS new_regis,
           SUM(depo_regis)::int AS depo_regis
    FROM referral_daily_snapshots
    WHERE tenant_id = $1 AND division_id = $2 AND date >= $3 AND date <= $4
    GROUP BY date
    ORDER BY date ASC
  `, [tenantId, divisionId, startStr, endDate]);
}

/**
 * Get monthly breakdown for a division — for each (brand, referral) in the division,
 * return day-by-day new_regis + depo_regis for the month containing targetDate.
 *
 * Returns: [
 *   { brand_key, brand_name, brand_color, referral_code, display_name,
 *     days: [{day, new_regis, depo_regis}, ... entire month] },
 *   ...
 * ]
 */
export async function getReferralMonthlyBreakdown(tenantId, divisionId, targetDate) {
  const [y, m] = targetDate.split('-');
  const year = parseInt(y);
  const month = parseInt(m);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${y}-${m}-01`;
  const monthEnd = `${y}-${m}-${String(daysInMonth).padStart(2, '0')}`;

  // All active referrals for this division with brand metadata
  const refs = await queryRows(`
    SELECT rc.brand_key, rc.referral_code, rc.display_name,
           b.name AS brand_name, b.primary_color AS brand_color
    FROM referral_codes rc
    LEFT JOIN report_brands b ON b.key = rc.brand_key AND b.tenant_id = rc.tenant_id
    WHERE rc.tenant_id = $1 AND rc.division_id = $2 AND rc.is_active = 1
    ORDER BY rc.brand_key, rc.referral_code
  `, [tenantId, divisionId]);

  // Snapshot rows for the month
  const snaps = await queryRows(`
    SELECT brand_key, referral_code, date, new_regis, depo_regis
    FROM referral_daily_snapshots
    WHERE tenant_id = $1 AND division_id = $2 AND date >= $3 AND date <= $4
  `, [tenantId, divisionId, monthStart, monthEnd]);

  // Index snapshots by (brand_key|referral_code|day)
  const snapIdx = new Map();
  for (const s of snaps) {
    const day = parseInt(s.date.split('-')[2]);
    snapIdx.set(`${s.brand_key}|${s.referral_code}|${day}`, {
      new_regis: s.new_regis || 0,
      depo_regis: s.depo_regis || 0,
    });
  }

  // Build result: one entry per (brand, referral) with full month days array
  return refs.map(r => {
    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const k = `${r.brand_key}|${r.referral_code}|${day}`;
      const s = snapIdx.get(k);
      days.push({
        day,
        new_regis: s?.new_regis || 0,
        depo_regis: s?.depo_regis || 0,
      });
    }
    return {
      brand_key: r.brand_key,
      brand_name: r.brand_name || r.brand_key,
      brand_color: r.brand_color || '#7c3aed',
      referral_code: r.referral_code,
      display_name: r.display_name || r.referral_code,
      days,
      year,
      month,
      daysInMonth,
    };
  });
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
