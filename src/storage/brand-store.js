/**
 * Brand Store — CRUD untuk report_brands (tenant-scoped)
 */

import { query, queryRows, queryOne } from './postgres.js';

export async function getAllBrands(activeOnly = true, tenantId = null) {
  const conditions = [];
  const params = [];
  if (activeOnly) conditions.push('is_active = 1');
  if (tenantId) { conditions.push(`tenant_id = $${params.length + 1}`); params.push(tenantId); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return queryRows(`SELECT * FROM report_brands ${where} ORDER BY sort_order ASC, id ASC`, params);
}

export async function getBrandByKey(key, tenantId = null) {
  if (tenantId) {
    return queryOne('SELECT * FROM report_brands WHERE key = $1 AND tenant_id = $2', [key, tenantId]);
  }
  return queryOne('SELECT * FROM report_brands WHERE key = $1', [key]);
}

export async function getBrandById(id) {
  return queryOne('SELECT * FROM report_brands WHERE id = $1', [id]);
}

export async function createBrand(data) {
  const result = await query(`
    INSERT INTO report_brands (key, name, engine, domain, is_active, sort_order,
      user_id, cookie_header, auth_user, auth_pass, auth_pin, auth_api_key, auth_hash,
      primary_color, logo_base64, tenant_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *
  `, [
    data.key, data.name, data.engine, data.domain,
    data.is_active ?? 1, data.sort_order ?? 0,
    data.user_id ?? 0, data.cookie_header?.replace(/[\r\n]/g, '').trim() || null,
    data.auth_user ?? null, data.auth_pass ?? null, data.auth_pin ?? null,
    data.auth_api_key ?? null, data.auth_hash ?? null,
    data.primary_color ?? '#7c3aed', data.logo_base64 ?? null,
    data.tenant_id ?? null,
  ]);
  return result.rows[0];
}

export async function updateBrand(key, data, tenantId = null) {
  const fields = [];
  const values = [];
  let idx = 1;

  const allowedFields = [
    'name', 'engine', 'domain', 'is_active', 'sort_order',
    'user_id', 'cookie_header', 'auth_user', 'auth_pass', 'auth_pin', 'auth_api_key', 'auth_hash',
    'primary_color', 'logo_base64'
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = $${idx}`);
      values.push(data[field]);
      idx++;
    }
  }

  if (fields.length === 0) return getBrandByKey(key, tenantId);

  fields.push('updated_at = NOW()');
  values.push(key);
  let sql = `UPDATE report_brands SET ${fields.join(', ')} WHERE key = $${idx}`;
  if (tenantId) { sql += ` AND tenant_id = $${idx + 1}`; values.push(tenantId); }

  await query(sql, values);
  return getBrandByKey(key, tenantId);
}

export async function deleteBrand(key, tenantId = null) {
  if (tenantId) {
    await query("UPDATE report_brands SET is_active = 0, updated_at = NOW() WHERE key = $1 AND tenant_id = $2", [key, tenantId]);
  } else {
    await query("UPDATE report_brands SET is_active = 0, updated_at = NOW() WHERE key = $1", [key]);
  }
}

export async function hardDeleteBrand(key) {
  await query('DELETE FROM report_brands WHERE key = $1', [key]);
}

export async function updateBrandCookie(key, cookieHeader, tenantId = null) {
  // Auto-clean: hapus newline, carriage return, trim whitespace
  const clean = cookieHeader?.replace(/[\r\n]/g, '').trim() || '';
  if (tenantId) {
    await query("UPDATE report_brands SET cookie_header = $1, updated_at = NOW() WHERE key = $2 AND tenant_id = $3", [clean, key, tenantId]);
  } else {
    await query("UPDATE report_brands SET cookie_header = $1, updated_at = NOW() WHERE key = $2", [clean, key]);
  }
}

export async function getBrandCount(tenantId = null) {
  if (tenantId) {
    const row = await queryOne('SELECT COUNT(*) as count FROM report_brands WHERE is_active = 1 AND tenant_id = $1', [tenantId]);
    return parseInt(row.count);
  }
  const row = await queryOne('SELECT COUNT(*) as count FROM report_brands WHERE is_active = 1');
  return parseInt(row.count);
}
