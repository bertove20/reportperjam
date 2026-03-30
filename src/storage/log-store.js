/**
 * Log Store — job_logs untuk monitoring
 */

import { getDb } from './sqlite.js';

export function insertLog(jobType, brandKey, status, message = null, durationMs = null) {
  getDb().prepare(`
    INSERT INTO job_logs (job_type, brand_key, status, message, duration_ms)
    VALUES (?, ?, ?, ?, ?)
  `).run(jobType, brandKey, status, message, durationMs);
}

export function queryLogs({ type, brand, status, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const params = [];

  if (type) { conditions.push('job_type = ?'); params.push(type); }
  if (brand) { conditions.push('brand_key = ?'); params.push(brand); }
  if (status) { conditions.push('status = ?'); params.push(status); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const logs = getDb().prepare(
    `SELECT * FROM job_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  const total = getDb().prepare(
    `SELECT COUNT(*) as count FROM job_logs ${where}`
  ).get(...params).count;

  return { logs, total };
}

export function getLatestLog(brandKey, jobType) {
  return getDb().prepare(
    'SELECT * FROM job_logs WHERE brand_key = ? AND job_type = ? ORDER BY created_at DESC LIMIT 1'
  ).get(brandKey, jobType);
}

export function cleanOldLogs(daysToKeep = 30) {
  const result = getDb().prepare(
    `DELETE FROM job_logs WHERE created_at < datetime('now', '-' || ? || ' days')`
  ).run(daysToKeep);
  return result.changes;
}

export function getLogStats() {
  return getDb().prepare(`
    SELECT
      job_type,
      status,
      COUNT(*) as count,
      MAX(created_at) as last_at
    FROM job_logs
    WHERE created_at > datetime('now', '-1 day')
    GROUP BY job_type, status
  `).all();
}
