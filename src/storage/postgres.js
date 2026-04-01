/**
 * PostgreSQL Storage — Core Database
 *
 * Tables:
 *   - hourly_snapshots: data TRX/REGIS per jam per brand
 *   - brands: konfigurasi brand
 *   - settings: app settings key-value
 *   - admin_users: login admin
 *   - job_logs: monitoring fetch/render/send
 */

import pg from 'pg';
import { logger } from '../logger.js';

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) throw new Error('Database not initialized. Call initDatabase() first.');
  return pool;
}

/**
 * Query helper — single query
 */
export async function query(sql, params = []) {
  return getPool().query(sql, params);
}

/**
 * Query helper — return rows
 */
export async function queryRows(sql, params = []) {
  const result = await getPool().query(sql, params);
  return result.rows;
}

/**
 * Query helper — return single row
 */
export async function queryOne(sql, params = []) {
  const result = await getPool().query(sql, params);
  return result.rows[0] || null;
}

export async function initDatabase() {
  const connectionString = process.env.DATABASE_URL ||
    `postgresql://${process.env.PG_USER || 'postgres'}:${process.env.PG_PASS || 'postgres'}@${process.env.PG_HOST || 'localhost'}:${process.env.PG_PORT || 5432}/${process.env.PG_DB || 'reportbot'}`;

  pool = new Pool({ connectionString, max: 20 });

  // Test connection
  try {
    await pool.query('SELECT NOW()');
  } catch (err) {
    logger.error({ err: err.message }, 'PostgreSQL connection failed');
    throw err;
  }

  // ─── Create tables ───
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hourly_snapshots (
      id SERIAL PRIMARY KEY,
      brand TEXT NOT NULL,
      date TEXT NOT NULL,
      hour INTEGER NOT NULL,
      deposit_accepted_count INTEGER,
      regis_total INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(brand, date, hour)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_snapshots_brand_date ON hourly_snapshots(brand, date)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS brands (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      engine TEXT NOT NULL CHECK(engine IN ('asia77', 'syntech')),
      domain TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      user_id INTEGER DEFAULT 0,
      cookie_header TEXT,
      auth_user TEXT,
      auth_pass TEXT,
      auth_pin TEXT,
      primary_color TEXT DEFAULT '#7c3aed',
      logo_base64 TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_logs (
      id SERIAL PRIMARY KEY,
      job_type TEXT NOT NULL,
      brand_key TEXT,
      status TEXT NOT NULL,
      message TEXT,
      duration_ms INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_logs_created ON job_logs(created_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_logs_brand ON job_logs(brand_key, created_at)`);

  logger.info('PostgreSQL initialized');
}

// ═══════════════════════════════════════════════
// hourly_snapshots operations
// ═══════════════════════════════════════════════

const FRESH_THRESHOLD_MS = 55 * 60 * 1000;

export async function upsertSnapshot(brand, date, hour, trx, regis) {
  const existing = await queryOne(
    'SELECT updated_at FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = $3',
    [brand, date, hour]
  );

  if (existing) {
    const age = Date.now() - new Date(existing.updated_at).getTime();
    if (age < FRESH_THRESHOLD_MS) {
      return;
    }
  }

  await query(`
    INSERT INTO hourly_snapshots (brand, date, hour, deposit_accepted_count, regis_total, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT(brand, date, hour)
    DO UPDATE SET
      deposit_accepted_count = EXCLUDED.deposit_accepted_count,
      regis_total = EXCLUDED.regis_total,
      updated_at = NOW()
  `, [brand, date, hour, trx, regis]);
}

export async function upsertSnapshotNullable(brand, date, hour, trx, regis) {
  const existing = await queryOne(
    'SELECT deposit_accepted_count FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = $3',
    [brand, date, hour]
  );

  const finalTrx = trx !== null && trx !== undefined ? trx : (existing?.deposit_accepted_count ?? null);

  await query(`
    INSERT INTO hourly_snapshots (brand, date, hour, deposit_accepted_count, regis_total, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT(brand, date, hour)
    DO UPDATE SET
      deposit_accepted_count = EXCLUDED.deposit_accepted_count,
      regis_total = EXCLUDED.regis_total,
      updated_at = NOW()
  `, [brand, date, hour, finalTrx, regis]);
}

export async function getSnapshots(brand, date) {
  return queryRows(
    'SELECT hour, deposit_accepted_count, regis_total FROM hourly_snapshots WHERE brand = $1 AND date = $2 ORDER BY hour ASC',
    [brand, date]
  );
}

export async function getSnapshot(brand, date, hour) {
  return queryOne(
    'SELECT hour, deposit_accepted_count, regis_total FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = $3',
    [brand, date, hour]
  );
}
