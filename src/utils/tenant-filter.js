/**
 * Tenant Filter — auto-inject tenant_id into SQL queries
 */

/**
 * Get tenant_id from request (from JWT or middleware)
 */
export function getTenantId(request) {
  return request.tenantId || request.user?.tenant_id || null;
}

/**
 * Add tenant_id filter to WHERE clause
 * @param {number} tenantId
 * @param {Array} existingParams - already used $1, $2, etc.
 * @param {string} alias - table alias (optional, e.g. 't')
 * @returns {{ where: string, params: Array }}
 */
export function addTenantFilter(tenantId, existingParams = [], alias = '') {
  const col = alias ? `${alias}.tenant_id` : 'tenant_id';
  const idx = existingParams.length + 1;
  return {
    where: ` AND ${col} = $${idx}`,
    params: [...existingParams, tenantId],
  };
}

/**
 * Build a standalone WHERE for tenant
 */
export function tenantWhere(tenantId, startIdx = 1, alias = '') {
  const col = alias ? `${alias}.tenant_id` : 'tenant_id';
  return { clause: `${col} = $${startIdx}`, idx: startIdx + 1 };
}
