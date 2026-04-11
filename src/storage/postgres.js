/**
 * PostgreSQL Storage — Multi-Tenant SaaS Ecosystem
 *
 * Tenant isolation via tenant_id column on all tables.
 * Platform admin has tenant_id = NULL (operates across tenants).
 */

import pg from 'pg';
import { logger } from '../logger.js';

const { Pool } = pg;
let pool;

export function getPool() {
  if (!pool) throw new Error('Database not initialized');
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

  // Set timezone WIB (UTC+7) untuk setiap connection baru.
  // pool.on('connect') menahan client sampai handler-nya selesai sebelum
  // dipinjamkan ke caller, jadi kita HARUS pakai await — kalau pakai callback
  // (fire-and-forget) client akan diserahkan ke caller sementara SET timezone
  // masih jalan, dan pg akan throw "client is already executing a query".
  pool.on('connect', async (client) => {
    try {
      await client.query("SET timezone = 'Asia/Phnom_Penh'");
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to set timezone on new connection');
    }
  });

  try {
    await pool.query('SELECT NOW()');
  } catch (err) {
    logger.error({ err: err.message }, 'PostgreSQL connection failed');
    throw err;
  }

  // ═══════════════════════════════════════
  // SAAS — Plans, Tenants, Subscriptions
  // ═══════════════════════════════════════

  await pool.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      max_brands INTEGER DEFAULT 5,
      max_users INTEGER DEFAULT 10,
      max_report_brands INTEGER DEFAULT 5,
      features JSONB DEFAULT '{}',
      price_monthly NUMERIC(10,2) DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      domain TEXT,
      plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
      is_active INTEGER DEFAULT 1,
      logo_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      plan_id INTEGER REFERENCES plans(id),
      status TEXT DEFAULT 'active' CHECK(status IN ('active','trial','suspended','cancelled')),
      started_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ═══════════════════════════════════════
  // CORE — Users, Divisions, Settings
  // ═══════════════════════════════════════

  await pool.query(`
    CREATE TABLE IF NOT EXISTS divisions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('superadmin', 'leader', 'staff')),
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      division_id INTEGER REFERENCES divisions(id) ON DELETE SET NULL,
      is_platform_admin INTEGER DEFAULT 0,
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
      tenant_id INTEGER NOT NULL DEFAULT 0,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(key, module, tenant_id)
    )
  `);

  // ═══════════════════════════════════════
  // REPORT BOT
  // ═══════════════════════════════════════

  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_brands (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      engine TEXT NOT NULL CHECK(engine IN ('asia77', 'syntech')),
      domain TEXT NOT NULL,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
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
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      deposit_accepted_count INTEGER,
      regis_total INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_snapshots_tenant_brand ON hourly_snapshots(tenant_id, brand, date)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_logs (
      id SERIAL PRIMARY KEY,
      job_type TEXT NOT NULL,
      brand_key TEXT,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      message TEXT,
      duration_ms INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_job_logs_tenant ON job_logs(tenant_id, created_at)`);

  // ═══════════════════════════════════════
  // FINANCE
  // ═══════════════════════════════════════

  await pool.query(`
    CREATE TABLE IF NOT EXISTS finance_brands (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
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
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
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
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
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
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
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
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
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
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
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
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id, transaction_date)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS balance_adjustments (
      id SERIAL PRIMARY KEY,
      payment_method_id INTEGER REFERENCES payment_methods(id) ON DELETE CASCADE,
      amount NUMERIC(15,2) NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('topup', 'adjustment', 'transfer', 'loan_repayment')),
      description TEXT,
      exchange_rate NUMERIC(15,2),
      total_idr NUMERIC(15,2),
      remaining_amount NUMERIC(15,2),
      adjustment_date DATE DEFAULT CURRENT_DATE,
      loan_id INTEGER,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
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
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
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
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ─── Audit Log ───
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      module TEXT,
      target_type TEXT,
      target_id TEXT,
      details JSONB,
      ip_address TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id, created_at)`);

  // ─── Password Reset Tokens ───
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ─── Migration: add tenant_id to existing tables ───
  await migrateToMultiTenant();

  logger.info('PostgreSQL initialized (multi-tenant SaaS)');
}

/**
 * Migrate existing single-tenant data to multi-tenant
 */
async function migrateToMultiTenant() {
  // Add columns if missing (for existing databases)
  const alterations = [
    'ALTER TABLE divisions ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin INTEGER DEFAULT 0',
    'ALTER TABLE report_brands ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE hourly_snapshots ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE job_logs ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE finance_brands ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE banks ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE teams ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE brand_budgets ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE balance_adjustments ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE balance_adjustments ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(15,2)',
    'ALTER TABLE balance_adjustments ADD COLUMN IF NOT EXISTS total_idr NUMERIC(15,2)',
    'ALTER TABLE balance_adjustments ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(15,2)',
    'ALTER TABLE fifo_allocations ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE loans ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE settings ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
    'ALTER TABLE divisions ADD COLUMN IF NOT EXISTS tg_group_id TEXT',
    'ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS referral_type TEXT',
  ];

  // Referral codes table (brand → referral → division mapping)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_codes (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      brand_key TEXT NOT NULL,
      referral_code TEXT NOT NULL,
      division_id INTEGER REFERENCES divisions(id) ON DELETE SET NULL,
      display_name TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_codes ON referral_codes(tenant_id, brand_key, referral_code)').catch(() => {});
  await query('CREATE INDEX IF NOT EXISTS idx_referral_codes_division ON referral_codes(division_id)').catch(() => {});

  // Referral daily snapshots — store fetch results per day for 30-day trend
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_daily_snapshots (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      division_id INTEGER REFERENCES divisions(id) ON DELETE CASCADE,
      brand_key TEXT NOT NULL,
      referral_code TEXT NOT NULL,
      date TEXT NOT NULL,
      new_regis INTEGER DEFAULT 0,
      depo_regis INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_ref_daily_snap ON referral_daily_snapshots(tenant_id, division_id, brand_key, referral_code, date)').catch(() => {});
  await query('CREATE INDEX IF NOT EXISTS idx_ref_daily_date ON referral_daily_snapshots(tenant_id, division_id, date)').catch(() => {});

  for (const sql of alterations) {
    await query(sql).catch(() => {});
  }

  // Drop old unique constraints that don't include tenant_id
  await query('ALTER TABLE users DROP CONSTRAINT IF EXISTS admin_users_username_key').catch(() => {});
  await query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key').catch(() => {});
  await query('ALTER TABLE report_brands DROP CONSTRAINT IF EXISTS report_brands_key_key').catch(() => {});
  await query('ALTER TABLE report_brands DROP CONSTRAINT IF EXISTS brands_key_key').catch(() => {});
  await query('ALTER TABLE hourly_snapshots DROP CONSTRAINT IF EXISTS hourly_snapshots_brand_date_hour_key').catch(() => {});

  // Create new unique constraints with tenant_id
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_username ON users(tenant_id, username)').catch(() => {});
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_report_brands_tenant_key ON report_brands(tenant_id, key)').catch(() => {});
  await query('CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshots_tenant ON hourly_snapshots(tenant_id, brand, date, hour)').catch(() => {});

  // Create default plan if not exists
  await query(`INSERT INTO plans (name, max_brands, max_users, max_report_brands, price_monthly)
    VALUES ('Free', 5, 5, 3, 0) ON CONFLICT(name) DO NOTHING`);
  await query(`INSERT INTO plans (name, max_brands, max_users, max_report_brands, price_monthly)
    VALUES ('Starter', 20, 15, 10, 0) ON CONFLICT(name) DO NOTHING`);
  await query(`INSERT INTO plans (name, max_brands, max_users, max_report_brands, price_monthly)
    VALUES ('Business', 100, 50, 50, 0) ON CONFLICT(name) DO NOTHING`);
  await query(`INSERT INTO plans (name, max_brands, max_users, max_report_brands, price_monthly)
    VALUES ('Enterprise', 9999, 9999, 9999, 0) ON CONFLICT(name) DO NOTHING`);

  // Create default tenant for existing data
  const defaultTenant = await queryOne("SELECT id FROM tenants WHERE slug = 'default'");
  if (!defaultTenant) {
    const plan = await queryOne("SELECT id FROM plans WHERE name = 'Enterprise'");
    await query(
      "INSERT INTO tenants (name, slug, plan_id) VALUES ('Default', 'default', $1)",
      [plan?.id || 1]
    );
    logger.info('Created default tenant');

    // Assign all existing data to default tenant
    const tenant = await queryOne("SELECT id FROM tenants WHERE slug = 'default'");
    if (tenant) {
      const tables = ['divisions', 'users', 'report_brands', 'hourly_snapshots', 'job_logs',
        'finance_brands', 'banks', 'payment_methods', 'teams', 'expense_categories',
        'brand_budgets', 'transactions', 'balance_adjustments', 'fifo_allocations', 'loans'];
      for (const t of tables) {
        await query(`UPDATE ${t} SET tenant_id = $1 WHERE tenant_id IS NULL`, [tenant.id]).catch(() => {});
      }

      // Make existing admin a platform admin
      await query("UPDATE users SET is_platform_admin = 1, tenant_id = $1 WHERE role = 'superadmin' AND tenant_id IS NULL", [tenant.id]).catch(() => {});
      logger.info(`Migrated existing data to tenant ${tenant.id}`);
    }
  }
}

// ═══════════════════════════════════════════════
// hourly_snapshots operations
// ═══════════════════════════════════════════════

const FRESH_THRESHOLD_MS = 55 * 60 * 1000;

export async function upsertSnapshot(brand, date, hour, trx, regis, tenantId = 1) {
  const tid = tenantId || 1;
  const existing = await queryOne(
    'SELECT updated_at FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = $3 AND tenant_id = $4',
    [brand, date, hour, tid]
  );

  if (existing) {
    const age = Date.now() - new Date(existing.updated_at).getTime();
    if (age < FRESH_THRESHOLD_MS) return;
  }

  await query(`
    INSERT INTO hourly_snapshots (brand, date, hour, deposit_accepted_count, regis_total, tenant_id, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT ON CONSTRAINT uq_snapshots_tenant
    DO UPDATE SET
      deposit_accepted_count = EXCLUDED.deposit_accepted_count,
      regis_total = EXCLUDED.regis_total,
      updated_at = NOW()
  `, [brand, date, hour, trx, regis, tid]);
}

export async function upsertSnapshotNullable(brand, date, hour, trx, regis, tenantId = 1) {
  const tid = tenantId || 1;
  const existing = await queryOne(
    'SELECT deposit_accepted_count FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = $3 AND tenant_id = $4',
    [brand, date, hour, tid]
  );

  const finalTrx = trx !== null && trx !== undefined ? trx : (existing?.deposit_accepted_count ?? null);

  await query(`
    INSERT INTO hourly_snapshots (brand, date, hour, deposit_accepted_count, regis_total, tenant_id, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT ON CONSTRAINT uq_snapshots_tenant
    DO UPDATE SET
      deposit_accepted_count = EXCLUDED.deposit_accepted_count,
      regis_total = EXCLUDED.regis_total,
      updated_at = NOW()
  `, [brand, date, hour, finalTrx, regis, tid]);
}

export async function getSnapshots(brand, date, tenantId = 1) {
  const tid = tenantId || 1;
  return queryRows(
    'SELECT hour, deposit_accepted_count, regis_total FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND tenant_id = $3 ORDER BY hour ASC',
    [brand, date, tid]
  );
}

export async function getSnapshot(brand, date, hour, tenantId = 1) {
  const tid = tenantId || 1;
  return queryOne(
    'SELECT hour, deposit_accepted_count, regis_total FROM hourly_snapshots WHERE brand = $1 AND date = $2 AND hour = $3 AND tenant_id = $4',
    [brand, date, hour, tid]
  );
}
