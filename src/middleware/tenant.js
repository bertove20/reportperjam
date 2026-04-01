/**
 * Tenant Resolution Middleware
 *
 * Resolves tenant from:
 *   1. Subdomain: company-a.report.grup138.com → slug "company-a"
 *   2. JWT token: request.user.tenant_id (after auth)
 *   3. Default: slug "default" for backward compat
 */

import { queryOne } from '../storage/postgres.js';

const BASE_DOMAIN = process.env.BASE_DOMAIN || 'report.grup138.com';

// Cache tenants (refresh every 5 min)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function getTenantBySlug(slug) {
  const cacheKey = `slug:${slug}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const tenant = await queryOne(
    'SELECT t.*, p.name as plan_name, p.max_brands, p.max_users, p.max_report_brands FROM tenants t LEFT JOIN plans p ON t.plan_id = p.id WHERE t.slug = $1',
    [slug]
  );

  cache.set(cacheKey, { data: tenant, ts: Date.now() });
  return tenant;
}

async function getTenantById(id) {
  const cacheKey = `id:${id}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const tenant = await queryOne(
    'SELECT t.*, p.name as plan_name, p.max_brands, p.max_users, p.max_report_brands FROM tenants t LEFT JOIN plans p ON t.plan_id = p.id WHERE t.id = $1',
    [id]
  );

  cache.set(cacheKey, { data: tenant, ts: Date.now() });
  return tenant;
}

function extractSlugFromHost(host) {
  if (!host) return 'default';
  // Remove port
  const hostname = host.split(':')[0];

  // Check if it's a subdomain of BASE_DOMAIN
  if (hostname.endsWith(`.${BASE_DOMAIN}`)) {
    return hostname.replace(`.${BASE_DOMAIN}`, '');
  }

  // Direct domain match = default tenant
  if (hostname === BASE_DOMAIN || hostname === 'localhost') {
    return 'default';
  }

  // Custom domain: look up by domain
  return null; // will be resolved by domain lookup
}

/**
 * Register tenant resolver on Fastify
 */
export function registerTenantMiddleware(app) {
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0];

    // Skip tenant resolution for public routes
    if (path === '/api/signup' || path === '/api/tenant-info') return;

    // Platform admin routes don't need tenant
    if (path.startsWith('/api/platform/')) return;

    // Skip for static files
    if (!path.startsWith('/api/')) return;

    // Try to resolve tenant
    const host = request.headers.host;
    const slug = extractSlugFromHost(host);

    let tenant = null;
    if (slug) {
      tenant = await getTenantBySlug(slug);
    } else {
      // Custom domain lookup
      const hostname = host?.split(':')[0];
      tenant = await queryOne(
        'SELECT t.*, p.name as plan_name, p.max_brands, p.max_users FROM tenants t LEFT JOIN plans p ON t.plan_id = p.id WHERE t.domain = $1',
        [hostname]
      );
    }

    // Fallback to default tenant
    if (!tenant) {
      tenant = await getTenantBySlug('default');
    }

    if (!tenant || !tenant.is_active) {
      return reply.code(404).send({ error: 'Tenant not found or inactive' });
    }

    request.tenant = tenant;
    request.tenantId = tenant.id;
  });
}

/**
 * Clear tenant cache (call after tenant update)
 */
export function clearTenantCache() {
  cache.clear();
}

export { getTenantBySlug, getTenantById };
