/**
 * PostgreSQL Storage — Unified Ecosystem Database
 *
 * Modules:
 *   - Core: users, divisions, settings, permissions
 *   - Report Bot: report_brands, hourly_snapshots, job_logs
 *   - Finance: finance_brands, banks, payment_methods, transactions, etc.
 */

import pg from 'pg';
import { logger } from '../logger.js';

const { Pool } = pg;
let pool;

export function getPool() {
  if (!pool) throw new Error('Database not initialized. Call initDatabase() first.');
  return pool;
}

export async function query(sql, params = []) {
  return getPool().query(sql, params);
}

export async function queryRows(sql, params = []) {
  const result = await getPool().query(sql, params);
  return result.rows;
}

export async function queryOne(sql, params = []) {
  const result = await getPool().query(sql, params);
  return result.rows[0] || null;
}

export async function initDatabase() {
  const connectionString = process.env.DATABASE_URL ||
    `postgresql://${process.env.PG_USER || 'postgres'}:${process.env.PG_PASS || 'postgres'}@${process.env.PG_HOST || 'localhost'}:${process.env.PG_PORT || 5432}/${process.env.PG_DB || 'reportbot'}`;

  pool = new Pool({ connectionString, max: 20 });

  try {
    await pool.query('SELECT NOW()');
  } catch (err) {
    logger.error({ err: err.message }, 'PostgreSQL connection failed');
    throw err;
  }

  // ═══════════════════════════════════════
  // CORE — Users, Divisions, Settings
  // ═══════════════════════════════════════

  await pool.query(`
    CREATE TABLE IF NOT EXISTS divisions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('superadmin', 'leader', 'staff')),
      division_id INTEGER REFERENCES divisions(id) ON DELETE SET NULL,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      module TEXT NOT NULL,
      can_edit INTEGER DEFAULT 0,
      brand_scope TEXT DEFAULT '*',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, module)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT NOT NULL,
      module TEXT NOT NULL DEFAULT 'global',
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(key, module)
    )
  `);

  // ═══════════════════════════════════════
  // REPORT BOT — Brands, Snapshots, Logs
  // ═══════════════════════════════════════

  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_brands (
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
      division_id INTEGER REFERENCES divisions(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

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

  // ═══════════════════════════════════════
  // FINANCE — Brands, Banks, Transactions
  // ═══════════════════════════════════════

  await pool.query(`
    CREATE TABLE IF NOT EXISTS finance_brands (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      division_id INTEGER REFERENCES divisions(id) ON DELETE SET NULL,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS banks (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      currency TEXT DEFAULT 'IDR',
      description TEXT,
      division_id INTEGER REFERENCES divisions(id) ON DELETE SET NULL,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id SERIAL PRIMARY KEY,
      bank_id INTEGER REFERENCES banks(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'bank_account',
      initial_balance NUMERIC(15,2) DEFAULT 0,
      current_balance NUMERIC(15,2) DEFAULT 0,
      currency TEXT DEFAULT 'IDR',
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      division_id INTEGER REFERENCES divisions(id) ON DELETE SET NULL,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(name, team_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS brand_budgets (
      id SERIAL PRIMARY KEY,
      brand_id INTEGER REFERENCES finance_brands(id) ON DELETE CASCADE,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      budget_amount NUMERIC(15,2) DEFAULT 0,
      budget_idr NUMERIC(15,2) DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(brand_id, month, year)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      brand_id INTEGER REFERENCES finance_brands(id) ON DELETE SET NULL,
      payment_method_id INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
      category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      amount NUMERIC(15,2) NOT NULL DEFAULT 0,
      amount_idr NUMERIC(15,2) DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      description TEXT,
      transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_brand ON transactions(brand_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS balance_adjustments (
      id SERIAL PRIMARY KEY,
      payment_method_id INTEGER REFERENCES payment_methods(id) ON DELETE CASCADE,
      amount NUMERIC(15,2) NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('topup', 'adjustment', 'transfer', 'loan_repayment')),
      description TEXT,
      adjustment_date DATE DEFAULT CURRENT_DATE,
      loan_id INTEGER,
      remaining_amount NUMERIC(15,2),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fifo_allocations (
      id SERIAL PRIMARY KEY,
      transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
      adjustment_id INTEGER REFERENCES balance_adjustments(id) ON DELETE CASCADE,
      amount NUMERIC(15,2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS loans (
      id SERIAL PRIMARY KEY,
      transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      payment_method_id INTEGER REFERENCES payment_methods(id) ON DELETE SET NULL,
      amount NUMERIC(15,2) NOT NULL,
      repaid_amount NUMERIC(15,2) DEFAULT 0,
      description TEXT,
      loan_date DATE DEFAULT CURRENT_DATE,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'partial', 'repaid')),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ─── Migrate: rename old tables if exist ───
  await migrateOldTables();

  logger.info('PostgreSQL initialized (unified ecosystem)');
}

/**
 * Migrate old table names to new names (backward compat)
 */
async function migrateOldTables() {
  // Rename `brands` → `report_brands` if old table exists
  const oldBrands = await queryOne("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'brands') as exists");
  const newBrands = await queryOne("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'report_brands') as exists");

  if (oldBrands?.exists && !newBrands?.exists) {
    await query('ALTER TABLE brands RENAME TO report_brands');
    logger.info('Migrated: brands → report_brands');
  }

  // Rename `admin_users` → `users` if old table exists
  const oldUsers = await queryOne("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_users') as exists");
  const newUsers = await queryOne("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') as exists");

  if (oldUsers?.exists && !newUsers?.exists) {
    await query('ALTER TABLE admin_users RENAME TO users');
    // Add new columns
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT");
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'superadmin'");
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS division_id INTEGER");
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1");
    logger.info('Migrated: admin_users → users with role columns');
  } else if (newUsers?.exists) {
    // Ensure columns exist on existing users table
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT").catch(() => {});
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'superadmin'").catch(() => {});
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS division_id INTEGER").catch(() => {});
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1").catch(() => {});
  }

  // Migrate settings table: add module column if not exists
  await query("ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey").catch(() => {});
  await query("ALTER TABLE settings ADD COLUMN IF NOT EXISTS module TEXT DEFAULT 'global'").catch(() => {});
  // Re-add primary key with module
  const hasPK = await queryOne("SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'settings' AND constraint_type = 'PRIMARY KEY'");
  if (!hasPK) {
    await query("ALTER TABLE settings ADD PRIMARY KEY (key, module)").catch(() => {});
  }

  // Add division_id to report_brands if not exists
  await query("ALTER TABLE report_brands ADD COLUMN IF NOT EXISTS division_id INTEGER").catch(() => {});
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
    if (age < FRESH_THRESHOLD_MS) return;
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
