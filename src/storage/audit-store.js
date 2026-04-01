/**
 * Audit Log Store — track semua aktivitas user
 */

import { query, queryRows } from './postgres.js';

/**
 * Log an action
 * @param {Object} ctx - { tenantId, userId, username, ip }
 * @param {string} action - 'create', 'update', 'delete', 'login', 'export', etc
 * @param {string} module - 'report', 'finance', 'admin', 'auth'
 * @param {string} targetType - 'brand', 'transaction', 'user', etc
 * @param {string|number} targetId
 * @param {Object} details - extra data
 */
export async function auditLog(ctx, action, module, targetType = null, targetId = null, details = null) {
  await query(`
    INSERT INTO audit_logs (tenant_id, user_id, username, action, module, target_type, target_id, details, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    ctx.tenantId || null,
    ctx.userId || null,
    ctx.username || null,
    action,
    module,
    targetType,
    targetId ? String(targetId) : null,
    details ? JSON.stringify(details) : null,
    ctx.ip || null,
  ]);
}

/**
 * Helper: extract audit context from request
 */
export function auditCtx(request) {
  return {
    tenantId: request.tenantId || request.user?.tenant_id,
    userId: request.user?.id,
    username: request.user?.username,
    ip: request.ip,
  };
}

/**
 * Query audit logs
 */
export async function queryAuditLogs({ tenantId, module, action, userId, limit = 50, offset = 0 }) {
  const conditions = ['1=1'];
  const params = [];
  let idx = 1;

  if (tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(tenantId); }
  if (module) { conditions.push(`module = $${idx++}`); params.push(module); }
  if (action) { conditions.push(`action = $${idx++}`); params.push(action); }
  if (userId) { conditions.push(`user_id = $${idx++}`); params.push(userId); }

  const where = conditions.join(' AND ');
  return queryRows(
    `SELECT * FROM audit_logs WHERE ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
}
