/**
 * Brand Configurations — tenant-scoped from Database
 */

import { getAllBrands as getAllBrandsFromDb } from '../storage/brand-store.js';
import { decrypt } from '../utils/crypto.js';

/**
 * Get active brands for a tenant
 */
export async function getBrands(tenantId = null) {
  try {
    const dbBrands = await getAllBrandsFromDb(true, tenantId);
    if (dbBrands.length > 0) {
      return dbBrands.map(b => ({
        key: b.key,
        name: b.name,
        engine: b.engine,
        domain: b.domain,
        userId: b.user_id || 0,
        cookieHeader: b.cookie_header || null,
        user: b.auth_user || null,
        pass: decrypt(b.auth_pass) || null,
        pin: decrypt(b.auth_pin) || null,
        apiKey: decrypt(b.auth_api_key) || null,
        hash: decrypt(b.auth_hash) || null,
        primary: b.primary_color || '#7c3aed',
        logo: b.logo_base64 || null,
        tenantId: b.tenant_id,
      }));
    }
  } catch {
    // DB not ready
  }
  return [];
}
