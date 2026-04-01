/**
 * Log Store — job_logs untuk monitoring (PostgreSQL)
 */

import { query, queryRows, queryOne } from './postgres.js';

export async function insertLog(jobType, brandKey, status, message = null, durationMs = null) {
  await query(`
    INSERT INTO job_logs (job_type, brand_key, status, message, duration_ms)
    VALUES ($1, $2, $3, $4, $5)
  `, [jobType, brandKey, status, message, durationMs]);
}

export async function queryLogs({ type, brand, status, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (type) { conditions.push(`job_type = $${idx++}`); params.push(type); }
  if (brand) { conditions.push(`brand_key = $${idx++}`); params.push(brand); }
  if (status) { conditions.push(`status = $${idx++}`); params.push(status); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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

export async function getLatestLog(brandKey, jobType) {
  return queryOne(
    'SELECT * FROM job_logs WHERE brand_key = $1 AND job_type = $2 ORDER BY created_at DESC LIMIT 1',
    [brandKey, jobType]
  );
}

export async function cleanOldLogs(daysToKeep = 30) {
  const result = await query(
    `DELETE FROM job_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
    [daysToKeep]
  );
  return result.rowCount;
}

export async function getLogStats() {
  return queryRows(`
    SELECT
      job_type,
      status,
      COUNT(*) as count,
      MAX(created_at) as last_at
    FROM job_logs
    WHERE created_at > NOW() - INTERVAL '1 day'
    GROUP BY job_type, status
  `);
}
