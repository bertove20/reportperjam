/**
 * Log Store — job_logs per brand, tenant-scoped (PostgreSQL)
 */

import { query, queryRows, queryOne } from './postgres.js';

export async function insertLog(jobType, brandKey, status, message = null, durationMs = null, tenantId = null) {
  await query(`
    INSERT INTO job_logs (job_type, brand_key, status, message, duration_ms, tenant_id)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [jobType, brandKey, status, message, durationMs, tenantId || 1]);
}

export async function queryLogs({ type, typeNotIn, brand, status, limit = 50, offset = 0, tenantId = null } = {}) {
  const conditions = ['tenant_id = $1'];
  const params = [tenantId || 1];
  let idx = 2;

  // type can be a single value, or comma-separated for IN
  if (type) {
    const types = String(type).split(',').map(t => t.trim()).filter(Boolean);
    if (types.length === 1) {
      conditions.push(`job_type = $${idx++}`);
      params.push(types[0]);
    } else {
      const placeholders = types.map(() => `$${idx++}`).join(', ');
      conditions.push(`job_type IN (${placeholders})`);
      params.push(...types);
    }
  }
  if (typeNotIn) {
    const types = String(typeNotIn).split(',').map(t => t.trim()).filter(Boolean);
    if (types.length > 0) {
      const placeholders = types.map(() => `$${idx++}`).join(', ');
      conditions.push(`job_type NOT IN (${placeholders})`);
      params.push(...types);
    }
  }
  if (brand) { conditions.push(`brand_key = $${idx++}`); params.push(brand); }
  if (status) { conditions.push(`status = $${idx++}`); params.push(status); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const logs = await queryRows(
    `SELECT * FROM job_logs ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  const totalRow = await queryOne(
    `SELECT COUNT(*) as count FROM job_logs ${where}`,
    params
  );

  return { logs, total: parseInt(totalRow.count) };
}

export async function getLatestLog(brandKey, jobType, tenantId = null) {
  return queryOne(
    'SELECT * FROM job_logs WHERE brand_key = $1 AND job_type = $2 AND tenant_id = $3 ORDER BY created_at DESC LIMIT 1',
    [brandKey, jobType, tenantId || 1]
  );
}

/**
 * Hapus log lama — default 7 hari
 */
export async function cleanOldLogs(daysToKeep = 7) {
  const result = await query(
    `DELETE FROM job_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
    [daysToKeep]
  );
  return result.rowCount;
}

/**
 * Hapus semua log dari bulan-bulan sebelumnya (dipanggil tanggal 1 tiap bulan).
 * Yang tersisa hanya log dari bulan kalender berjalan.
 *
 * date_trunc('month', NOW()) = jam 00:00:00 di tanggal 1 bulan berjalan (sesuai timezone DB).
 */
export async function cleanLogsBeforeCurrentMonth() {
  const result = await query(
    `DELETE FROM job_logs WHERE created_at < date_trunc('month', NOW())`
  );
  return result.rowCount;
}

/**
 * Stats per brand (untuk dashboard)
 */
export async function getLogStats(tenantId = null) {
  return queryRows(`
    SELECT
      job_type,
      brand_key,
      status,
      COUNT(*) as count,
      MAX(created_at) as last_at
    FROM job_logs
    WHERE created_at > NOW() - INTERVAL '1 day'
    AND tenant_id = $1
    GROUP BY job_type, brand_key, status
    ORDER BY brand_key, job_type
  `, [tenantId || 1]);
}

/**
 * Stats summary per brand (untuk log page)
 */
export async function getBrandLogSummary(tenantId = null) {
  return queryRows(`
    SELECT
      brand_key,
      COUNT(*) FILTER (WHERE status = 'success') as success_count,
      COUNT(*) FILTER (WHERE status = 'error') as error_count,
      MAX(created_at) FILTER (WHERE status = 'success') as last_success,
      MAX(created_at) FILTER (WHERE status = 'error') as last_error,
      MAX(created_at) as last_activity
    FROM job_logs
    WHERE tenant_id = $1
    AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY brand_key
    ORDER BY brand_key
  `, [tenantId || 1]);
}
