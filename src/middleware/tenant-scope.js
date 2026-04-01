/**
 * Tenant Scope — auto-inject tenantId ke setiap request handler
 *
 * Usage di route: const tid = req.tenantId
 * Semua query HARUS pakai tid untuk filter data
 */

/**
 * Fastify hook: setelah auth, pastikan tenantId tersedia
 */
export function requireTenant() {
  return async (request, reply) => {
    const tid = request.tenantId || request.user?.tenant_id;
    if (!tid) {
      return reply.code(403).send({ error: 'Tenant context required' });
    }
    request.tenantId = tid;
  };
}

/**
 * Build WHERE clause dengan tenant_id
 * @param {number} tenantId
 * @param {Array} params - existing params [$1, $2...]
 * @param {string} alias - table alias (e.g. 't')
 * @returns {{ where: string, params: Array, idx: number }}
 */
export function tWhere(tenantId, params = [], alias = '') {
  const col = alias ? `${alias}.tenant_id` : 'tenant_id';
  const idx = params.length + 1;
  return {
    where: `${col} = $${idx}`,
    andWhere: ` AND ${col} = $${idx}`,
    params: [...params, tenantId],
    idx: idx + 1,
  };
}
