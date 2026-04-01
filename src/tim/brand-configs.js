/**
 * Brand Configurations — Dynamic from Database (PostgreSQL)
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { getAllBrands as getAllBrandsFromDb } from '../storage/brand-store.js';
import { decrypt } from '../utils/crypto.js';

function loadLogo(filename) {
  try {
    const buffer = readFileSync(join('assets/logos', filename));
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Get active brands dari database (async).
 */
export async function getBrands() {
  try {
    const dbBrands = await getAllBrandsFromDb(true);
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
        primary: b.primary_color || '#7c3aed',
        logo: b.logo_base64 || null,
      }));
    }
  } catch {
    // DB belum ready — fallback ke .env
  }

  return getEnvBrands();
}

function getEnvBrands() {
  const brands = [];
  const prefixes = ['BRAND_A', 'BRAND_B', 'BRAND_C', 'BRAND_D', 'BRAND_E'];
  for (const prefix of prefixes) {
    const domain = process.env[`${prefix}_DOMAIN`];
    if (!domain) continue;
    const engine = process.env[`${prefix}_ENGINE`] || 'asia77';
    const brand = {
      key: process.env[`${prefix}_KEY`] || prefix,
      name: process.env[`${prefix}_NAME`] || prefix,
      engine, domain,
      primary: '#7c3aed',
      logo: loadLogo(`logo-${prefix.toLowerCase().replace('_', '-')}.png`),
    };
    if (engine === 'asia77') {
      brand.userId = parseInt(process.env[`${prefix}_IDUS`] || '0');
    } else if (engine === 'syntech') {
      brand.user = process.env[`${prefix}_USER`];
      brand.pass = process.env[`${prefix}_PASS`];
      brand.pin = process.env[`${prefix}_PIN`];
    }
    brands.push(brand);
  }
  return brands;
}
