/**
 * Platform Admin Routes — manage tenants, plans (SaaS)
 * Only accessible by platform admins (is_platform_admin = 1)
 */

import { query, queryRows, queryOne } from '../storage/postgres.js';
import { hashPassword } from '../utils/auth-utils.js';
import { clearTenantCache } from '../middleware/tenant.js';
import { logger } from '../logger.js';

function requirePlatformAdmin() {
  return async (request, reply) => {
    if (!request.user?.is_platform_admin) {
      reply.code(403).send({ error: 'Platform admin access required' });
    }
  };
}

export default async function platformRoutes(app) {
  const pAdmin = { preHandler: [requirePlatformAdmin()] };

  // ─── Tenants ───

  app.get('/api/platform/tenants', pAdmin, async () => {
    return queryRows(`
      SELECT t.*, p.name as plan_name,
        (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count,
        (SELECT COUNT(*) FROM report_brands WHERE tenant_id = t.id) as report_brand_count,
        (SELECT COUNT(*) FROM finance_brands WHERE tenant_id = t.id) as finance_brand_count
      FROM tenants t
      LEFT JOIN plans p ON t.plan_id = p.id
      ORDER BY t.created_at DESC
    `);
  });

  app.post('/api/platform/tenants', pAdmin, async (request) => {
    const { name, slug, plan_id, admin_username, admin_password } = request.body;
    if (!name || !slug || !admin_username || !admin_password) {
      return { error: 'name, slug, admin_username, admin_password required' };
    }

    // Create tenant
    const tenant = await query(
      'INSERT INTO tenants (name, slug, plan_id) VALUES ($1, $2, $3) RETURNING *',
      [name, slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'), plan_id || 1]
    );
    const tenantId = tenant.rows[0].id;

    // Create default division
    const div = await query(
      'INSERT INTO divisions (name, tenant_id) VALUES ($1, $2) RETURNING id',
      ['Default', tenantId]
    );

    // Create tenant admin
    const hash = await hashPassword(admin_password);
    await query(
      'INSERT INTO users (username, password_hash, full_name, role, tenant_id, division_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [admin_username, hash, name + ' Admin', 'superadmin', tenantId, div.rows[0].id]
    );

    // Create default settings
    await query("INSERT INTO settings (key, module, tenant_id, value) VALUES ('timezone', 'report', $1, 'Asia/Phnom_Penh') ON CONFLICT DO NOTHING", [tenantId]);
    await query("INSERT INTO settings (key, module, tenant_id, value) VALUES ('cron_fetch', 'report', $1, '0 1-23 * * *') ON CONFLICT DO NOTHING", [tenantId]);
    await query("INSERT INTO settings (key, module, tenant_id, value) VALUES ('cron_report', 'report', $1, '5 1-23 * * *') ON CONFLICT DO NOTHING", [tenantId]);
    await query("INSERT INTO settings (key, module, tenant_id, value) VALUES ('cron_finish', 'report', $1, '5 0 * * *') ON CONFLICT DO NOTHING", [tenantId]);

    clearTenantCache();
    logger.info({ tenantId, name, slug }, 'Tenant created');
    return { success: true, tenant: tenant.rows[0] };
  });

  app.put('/api/platform/tenants/:id', pAdmin, async (request) => {
    const { name, slug, plan_id, is_active, domain, logo_url } = request.body;
    await query(
      'UPDATE tenants SET name=COALESCE($1,name), slug=COALESCE($2,slug), plan_id=COALESCE($3,plan_id), is_active=COALESCE($4,is_active), domain=COALESCE($5,domain), logo_url=COALESCE($6,logo_url), updated_at=NOW() WHERE id=$7',
      [name, slug, plan_id, is_active, domain, logo_url, request.params.id]
    );
    clearTenantCache();
    return { success: true };
  });

  app.delete('/api/platform/tenants/:id', pAdmin, async (request) => {
    await query('UPDATE tenants SET is_active = 0, updated_at = NOW() WHERE id = $1', [request.params.id]);
    clearTenantCache();
    return { success: true };
  });

  // Impersonate — get JWT for a tenant admin
  app.post('/api/platform/tenants/:id/impersonate', pAdmin, async (request) => {
    const admin = await queryOne(
      "SELECT * FROM users WHERE tenant_id = $1 AND role = 'superadmin' AND is_active = 1 LIMIT 1",
      [request.params.id]
    );
    if (!admin) return { error: 'No admin user found for this tenant' };

    const token = request.server.jwt.sign({
      id: admin.id, username: admin.username, role: admin.role,
      tenant_id: admin.tenant_id, division_id: admin.division_id,
      full_name: admin.full_name, is_platform_admin: 0,
    }, { expiresIn: '1h' });

    return { token, user: { id: admin.id, username: admin.username, tenant_id: admin.tenant_id } };
  });

  // ─── Plans ───

  app.get('/api/platform/plans', pAdmin, async () => {
    return queryRows('SELECT * FROM plans ORDER BY price_monthly ASC');
  });

  app.post('/api/platform/plans', pAdmin, async (request) => {
    const { name, max_brands, max_users, max_report_brands, price_monthly, features } = request.body;
    const result = await query(
      'INSERT INTO plans (name, max_brands, max_users, max_report_brands, price_monthly, features) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, max_brands || 5, max_users || 10, max_report_brands || 5, price_monthly || 0, JSON.stringify(features || {})]
    );
    return result.rows[0];
  });

  app.put('/api/platform/plans/:id', pAdmin, async (request) => {
    const { name, max_brands, max_users, max_report_brands, price_monthly, features, is_active } = request.body;
    await query(
      'UPDATE plans SET name=COALESCE($1,name), max_brands=COALESCE($2,max_brands), max_users=COALESCE($3,max_users), max_report_brands=COALESCE($4,max_report_brands), price_monthly=COALESCE($5,price_monthly), features=COALESCE($6,features), is_active=COALESCE($7,is_active) WHERE id=$8',
      [name, max_brands, max_users, max_report_brands, price_monthly, features ? JSON.stringify(features) : null, is_active, request.params.id]
    );
    return { success: true };
  });

  // ─── Dashboard ───

  app.get('/api/platform/dashboard', pAdmin, async () => {
    const [tenantCount, userCount, planStats] = await Promise.all([
      queryOne('SELECT COUNT(*) as count FROM tenants WHERE is_active = 1'),
      queryOne('SELECT COUNT(*) as count FROM users WHERE is_active = 1'),
      queryRows('SELECT p.name, COUNT(t.id) as tenant_count FROM plans p LEFT JOIN tenants t ON t.plan_id = p.id GROUP BY p.id, p.name ORDER BY p.name'),
    ]);
    return {
      totalTenants: parseInt(tenantCount.count),
      totalUsers: parseInt(userCount.count),
      planStats,
    };
  });
}
