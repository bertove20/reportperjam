/**
 * Brand Store — CRUD untuk tabel brands
 */

import { getDb } from './sqlite.js';

export function getAllBrands(activeOnly = true) {
  const where = activeOnly ? 'WHERE is_active = 1' : '';
  return getDb().prepare(`SELECT * FROM brands ${where} ORDER BY sort_order ASC, id ASC`).all();
}

export function getBrandByKey(key) {
  return getDb().prepare('SELECT * FROM brands WHERE key = ?').get(key);
}

export function getBrandById(id) {
  return getDb().prepare('SELECT * FROM brands WHERE id = ?').get(id);
}

export function createBrand(data) {
  const stmt = getDb().prepare(`
    INSERT INTO brands (key, name, engine, domain, is_active, sort_order,
      user_id, cookie_header, auth_user, auth_pass, auth_pin,
      primary_color, logo_base64)
    VALUES (@key, @name, @engine, @domain, @is_active, @sort_order,
      @user_id, @cookie_header, @auth_user, @auth_pass, @auth_pin,
      @primary_color, @logo_base64)
  `);

  const result = stmt.run({
    key: data.key,
    name: data.name,
    engine: data.engine,
    domain: data.domain,
    is_active: data.is_active ?? 1,
    sort_order: data.sort_order ?? 0,
    user_id: data.user_id ?? 0,
    cookie_header: data.cookie_header ?? null,
    auth_user: data.auth_user ?? null,
    auth_pass: data.auth_pass ?? null,
    auth_pin: data.auth_pin ?? null,
    primary_color: data.primary_color ?? '#7c3aed',
    logo_base64: data.logo_base64 ?? null,
  });

  return getBrandById(result.lastInsertRowid);
}

export function updateBrand(key, data) {
  const fields = [];
  const values = {};

  const allowedFields = [
    'name', 'engine', 'domain', 'is_active', 'sort_order',
    'user_id', 'cookie_header', 'auth_user', 'auth_pass', 'auth_pin',
    'primary_color', 'logo_base64'
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      fields.push(`${field} = @${field}`);
      values[field] = data[field];
    }
  }

  if (fields.length === 0) return getBrandByKey(key);

  fields.push("updated_at = datetime('now')");
  values.key = key;

  getDb().prepare(`UPDATE brands SET ${fields.join(', ')} WHERE key = @key`).run(values);
  return getBrandByKey(key);
}

export function deleteBrand(key) {
  // Soft delete
  getDb().prepare("UPDATE brands SET is_active = 0, updated_at = datetime('now') WHERE key = ?").run(key);
}

export function hardDeleteBrand(key) {
  getDb().prepare('DELETE FROM brands WHERE key = ?').run(key);
}

export function updateBrandCookie(key, cookieHeader) {
  getDb().prepare("UPDATE brands SET cookie_header = ?, updated_at = datetime('now') WHERE key = ?").run(cookieHeader, key);
}

export function getBrandCount() {
  return getDb().prepare('SELECT COUNT(*) as count FROM brands WHERE is_active = 1').get().count;
}
