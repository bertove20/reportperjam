/**
 * SQLite Storage — Core Database
 *
 * Tables:
 *   - hourly_snapshots: data TRX/REGIS per jam per brand
 *   - brands: konfigurasi brand (ganti .env)
 *   - settings: app settings key-value (ganti .env)
 *   - admin_users: login admin
 *   - job_logs: monitoring fetch/render/send
 *
 * Database file: data/report.db
 * Mode: WAL (Write-Ahead Logging)
 */

import Database from 'better-sqlite3';
import { logger } from '../logger.js';

const DB_PATH = 'data/report.db';
let db;

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function initDatabase() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // ─── Existing: hourly_snapshots ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS hourly_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      date TEXT NOT NULL,
      hour INTEGER NOT NULL,
      deposit_accepted_count INTEGER DEFAULT 0,
      regis_total INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(brand, date, hour)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshots_brand_date ON hourly_snapshots(brand, date)`);

  // ─── New: brands ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      engine TEXT NOT NULL CHECK(engine IN ('asia77', 'syntech')),
      domain TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,

      -- Asia77 fields
      user_id INTEGER DEFAULT 0,
      cookie_header TEXT,

      -- Syntech fields
      auth_user TEXT,
      auth_pass TEXT,
      auth_pin TEXT,

      -- Visual
      primary_color TEXT DEFAULT '#7c3aed',
      logo_base64 TEXT,

      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ─── New: settings ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ─── New: admin_users ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ─── New: job_logs ───
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_type TEXT NOT NULL,
      brand_key TEXT,
      status TEXT NOT NULL,
      message TEXT,
      duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_job_logs_created ON job_logs(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_job_logs_brand ON job_logs(brand_key, created_at)`);

  logger.info({ path: DB_PATH }, 'SQLite initialized');
}

// ═══════════════════════════════════════════════
// hourly_snapshots operations (existing, unchanged)
// ═══════════════════════════════════════════════

const FRESH_THRESHOLD_MS = 55 * 60 * 1000;

export function upsertSnapshot(brand, date, hour, trx, regis) {
  const existing = getDb().prepare(
    'SELECT updated_at FROM hourly_snapshots WHERE brand = ? AND date = ? AND hour = ?'
  ).get(brand, date, hour);

  if (existing) {
    const age = Date.now() - new Date(existing.updated_at + 'Z').getTime();
    if (age < FRESH_THRESHOLD_MS) {
      logger.debug({ brand, date, hour, age: Math.round(age / 1000) }, 'Fresh-data guard: skip overwrite');
      return;
    }
  }

  getDb().prepare(`
    INSERT INTO hourly_snapshots (brand, date, hour, deposit_accepted_count, regis_total, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(brand, date, hour)
    DO UPDATE SET
      deposit_accepted_count = excluded.deposit_accepted_count,
      regis_total = excluded.regis_total,
      updated_at = datetime('now')
  `).run(brand, date, hour, trx, regis);
}

/**
 * Upsert yang support TRX null (untuk backfill tanggal lama yang hanya punya REGIS)
 * Jika TRX null dan sudah ada data, pertahankan TRX yang ada.
 * TANPA fresh-data guard (backfill boleh overwrite kapan saja).
 */
export function upsertSnapshotNullable(brand, date, hour, trx, regis) {
  const existing = getDb().prepare(
    'SELECT deposit_accepted_count FROM hourly_snapshots WHERE brand = ? AND date = ? AND hour = ?'
  ).get(brand, date, hour);

  const finalTrx = trx !== null && trx !== undefined ? trx : (existing?.deposit_accepted_count ?? null);

  getDb().prepare(`
    INSERT INTO hourly_snapshots (brand, date, hour, deposit_accepted_count, regis_total, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(brand, date, hour)
    DO UPDATE SET
      deposit_accepted_count = excluded.deposit_accepted_count,
      regis_total = excluded.regis_total,
      updated_at = datetime('now')
  `).run(brand, date, hour, finalTrx, regis);
}

export function getSnapshots(brand, date) {
  return getDb().prepare(
    'SELECT hour, deposit_accepted_count, regis_total FROM hourly_snapshots WHERE brand = ? AND date = ? ORDER BY hour ASC'
  ).all(brand, date);
}

export function getSnapshot(brand, date, hour) {
  return getDb().prepare(
    'SELECT hour, deposit_accepted_count, regis_total FROM hourly_snapshots WHERE brand = ? AND date = ? AND hour = ?'
  ).get(brand, date, hour);
}
