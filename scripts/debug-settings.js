#!/usr/bin/env node
/**
 * Debug Settings Lookup — Trace exactly what getSetting is doing
 * 
 * Usage: node --env-file=.env scripts/debug-settings.js
 */

import { initDatabase, queryRows, queryOne } from '../src/storage/postgres.js';
import { getSetting } from '../src/storage/settings-store.js';
import { logger } from '../src/logger.js';

async function debug() {
  console.log('\n' + '='.repeat(70));
  console.log('DEBUG: SETTINGS LOOKUP TRACE');
  console.log('='.repeat(70) + '\n');

  try {
    await initDatabase();

    // 1. Check what tenants exist
    console.log('📋 STEP 1: Active Tenants');
    const tenants = await queryRows('SELECT id, name, slug FROM tenants WHERE is_active = 1');
    console.log(`Found ${tenants.length} active tenants:`, tenants);

    // 2. Check ALL settings in database
    console.log('\n📋 STEP 2: ALL Settings in Database');
    const allSettings = await queryRows(`
      SELECT id, key, module, tenant_id, value, updated_at 
      FROM settings 
      ORDER BY module, tenant_id DESC, key
    `);
    console.log(`Found ${allSettings.length} settings rows:`);
    allSettings.forEach(s => {
      console.log(`  [${s.id}] ${s.module}:${s.key} (tenant_id=${s.tenant_id}) = "${s.value}"`);
    });

    // 3. Test getSetting for each tenant
    console.log('\n📋 STEP 3: Test getSetting(tg_report_group, report, tenantId)');
    for (const tenant of tenants) {
      const value = await getSetting('tg_report_group', 'report', tenant.id);
      console.log(`  Tenant ${tenant.id} (${tenant.slug}): getSetting() → "${value}"`);
    }

    // 4. Test getSetting with tenantId=0
    console.log('\n📋 STEP 4: Test getSetting(tg_report_group, report, 0)');
    const globalTgGroup = await getSetting('tg_report_group', 'report', 0);
    console.log(`  getSetting(0) → "${globalTgGroup}"`);

    // 5. Raw SQL query trace
    console.log('\n📋 STEP 5: Raw SQL Query Trace (tenantId=1)');
    const rawResult = await queryOne(`
      SELECT value 
      FROM settings 
      WHERE key = 'tg_report_group' 
      AND module = 'report' 
      AND (tenant_id = 1 OR tenant_id IS NULL) 
      ORDER BY tenant_id DESC 
      LIMIT 1
    `);
    console.log(`  Raw SQL result:`, rawResult);

    // 6. Environment variables
    console.log('\n📋 STEP 6: Environment Variables');
    console.log(`  TG_REPORT_GROUP(env) = "${process.env.TG_REPORT_GROUP}"`);
    console.log(`  TG_BOT_TOKEN(env) = "${process.env.TG_BOT_TOKEN ? '***[SET]***' : 'NOT SET'}"`);

  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'Debug failed');
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
  } finally {
    process.exit(0);
  }
}

debug();
