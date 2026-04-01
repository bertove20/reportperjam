/**
 * Brand Store — CRUD untuk tabel brands (PostgreSQL)
 */

import { query, queryRows, queryOne } from './postgres.js';

export async function getAllBrands(activeOnly = true) {
  const where = activeOnly ? 'WHERE is_active = 1' : '';
  return queryRows(`SELECT * FROM brands ${where} ORDER BY sort_order ASC, id ASC`);
}

export async function getBrandByKey(key) {
  return queryOne('SELECT * FROM brands WHERE key = $1', [key]);
}

export async function getBrandById(id) {
  return queryOne('SELECT * FROM brands WHERE id = $1', [id]);
}

export async function createBrand(data) {
  const result = await query(`
    INSERT INTO brands (key, name, engine, domain, is_active, sort_order,
      user_id, cookie_header, auth_user, auth_pass, auth_pin,
      primary_color, logo_base64)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `, [
    data.key, data.name, data.engine, data.domain,
    data.is_active ?? 1, data.sort_order ?? 0,
    data.user_id ?? 0, data.cookie_header ?? null,
    data.auth_user ?? null, data.auth_pass ?? null, data.auth_pin ?? null,
    data.primary_color ?? '#7c3aed', data.logo_base64 ?? null,
  ]);
  return result.rows[0];
}

export async function updateBrand(key, data) {
  const fields = [];
  const values = [];
  let idx = 1;

  const allowedFields = [
    'name', 'engine', 'domain', 'is_active', 'sort_order',
    'user_id', 'cookie_header', 'auth_user', 'auth_pass', 'auth_pin',
    'primary_color', 'logo_base64'
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = $${idx}`);
      values.push(data[field]);
      idx++;
    }
  }

  if (fields.length === 0) return getBrandByKey(key);

  fields.push(`updated_at = NOW()`);
  values.push(key);

  await query(`UPDATE brands SET ${fields.join(', ')} WHERE key = $${idx}`, values);
  return getBrandByKey(key);
}

export async function deleteBrand(key) {
  await query("UPDATE brands SET is_active = 0, updated_at = NOW() WHERE key = $1", [key]);
}

export async function hardDeleteBrand(key) {
  await query('DELETE FROM brands WHERE key = $1', [key]);
}

export async function updateBrandCookie(key, cookieHeader) {
  await query("UPDATE brands SET cookie_header = $1, updated_at = NOW() WHERE key = $2", [cookieHeader, key]);
}

export async function getBrandCount() {
  const row = await queryOne('SELECT COUNT(*) as count FROM brands WHERE is_active = 1');
  return parseInt(row.count);
}
