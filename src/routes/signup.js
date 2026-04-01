/**
 * Tenant Signup — public registration for new tenants
 */

import { query, queryOne } from '../storage/postgres.js';
import { hashPassword } from '../utils/auth-utils.js';
import { logger } from '../logger.js';

export default async function signupRoutes(app) {
  // POST /api/signup — create new tenant + admin user
  app.post('/api/signup', async (request, reply) => {
    const { company_name, username, password, full_name } = request.body || {};

    if (!company_name || !username || !password) {
      return reply.code(400).send({ error: 'company_name, username, password required' });
    }
    if (password.length < 4) return reply.code(400).send({ error: 'Password minimal 4 karakter' });

    // Generate slug
    const slug = company_name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    // Check slug unique
    const existing = await queryOne('SELECT id FROM tenants WHERE slug = $1', [slug]);
    if (existing) return reply.code(409).send({ error: 'Company name already taken' });

    // Get free plan
    const freePlan = await queryOne("SELECT id FROM plans WHERE name = 'Free'");

    // Create tenant
    const tenant = await query(
      'INSERT INTO tenants (name, slug, plan_id) VALUES ($1, $2, $3) RETURNING *',
      [company_name, slug, freePlan?.id || 1]
    );
    const tenantId = tenant.rows[0].id;

    // Create default division
    const div = await query(
      'INSERT INTO divisions (name, tenant_id) VALUES ($1, $2) RETURNING id',
      ['Default', tenantId]
    );

    // Create admin user
    const hash = await hashPassword(password);
    const user = await query(
      'INSERT INTO users (username, password_hash, full_name, role, tenant_id, division_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [username, hash, full_name || company_name + ' Admin', 'superadmin', tenantId, div.rows[0].id]
    );

    // Default settings
    await query("INSERT INTO settings (key, module, tenant_id, value) VALUES ('timezone', 'report', $1, 'Asia/Phnom_Penh')", [tenantId]);

    // Generate JWT
    const token = request.server.jwt.sign({
      id: user.rows[0].id,
      username,
      role: 'superadmin',
      tenant_id: tenantId,
      division_id: div.rows[0].id,
      full_name: full_name || company_name + ' Admin',
      is_platform_admin: 0,
    }, { expiresIn: '7d' });

    logger.info({ tenantId, slug, username }, 'New tenant registered');

    return {
      success: true,
      token,
      tenant: { id: tenantId, name: company_name, slug },
      loginUrl: `https://${slug}.${process.env.BASE_DOMAIN || 'report.grup138.com'}`,
    };
  });
}
