#!/usr/bin/env node
/**
 * Fix corrupted settings table - remove [object Object] entries
 * Usage: node --env-file=.env scripts/fix-settings-corruption.js
 */

import { initDatabase, queryRows, query } from '../src/storage/postgres.js';
import { logger } from '../src/logger.js';

async function fixCorruption() {
  console.log('\n' + '='.repeat(70));
  console.log('FIX: Settings Table Corruption');
  console.log('='.repeat(70) + '\n');

  try {
    await initDatabase();

    // 1. Find corrupted rows
    console.log('🔍 Step 1: Find corrupted rows (module = "[object Object]")');
    const corrupted = await queryRows(`
      SELECT key, module, tenant_id, value 
      FROM settings 
      WHERE module = '[object Object]'
    `);
    console.log(`Found ${corrupted.length} corrupted rows:`);
    corrupted.forEach(r => {
      console.log(`  ${r.key} | ${r.module} | tenant_id=${r.tenant_id} | value="${r.value}"`);
    });

    if (corrupted.length > 0) {
      console.log('\n🗑️  Deleting corrupted rows...');
      await query(`
        DELETE FROM settings WHERE module = '[object Object]'
      `);
      console.log('✅ Deleted!');
    }

    // 2. Find duplicate tg_report_group entries
    console.log('\n🔍 Step 2: Check for duplicate tg_report_group');
    const dups = await queryRows(`
      SELECT key, module, tenant_id, value, COUNT(*) as cnt
      FROM settings 
      WHERE key = 'tg_report_group'
      GROUP BY key, module, tenant_id, value
      HAVING COUNT(*) > 1
    `);
    console.log(`Found ${dups.length} duplicate groups`);
    dups.forEach(d => {
      console.log(`  ${d.key} | module=${d.module} | tenant_id=${d.tenant_id} | count=${d.cnt}`);
    });

    // 3. Verify final state
    console.log('\n📋 Step 3: Final settings state');
    const final = await queryRows(`
      SELECT key, module, tenant_id, value 
      FROM settings 
      WHERE key IN ('tg_report_group', 'tg_bot_token')
      ORDER BY key, tenant_id DESC, module
    `);
    console.log(`Final entries (${final.length} rows):`);
    final.forEach(r => {
      console.log(`  ${r.key} | module=${r.module} | tenant_id=${r.tenant_id} | value="${r.value}"`);
    });

    console.log('\n✅ Database cleanup complete!');

  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'Fix failed');
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

fixCorruption();
