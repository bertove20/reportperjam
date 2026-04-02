#!/usr/bin/env node
// VPS Scheduler Troubleshoot — Debug report pengiriman
// Usage: cd /opt/reportperjam && node --env-file=.env scripts/troubleshoot-reports.js

import { logger } from '../src/logger.js';
import { queryRows, queryOne } from '../src/storage/postgres.js';
import { initDatabase } from '../src/storage/postgres.js';
import { getBrands } from '../src/tim/brand-configs.js';
import { getTimBrandData } from '../src/tim/tim-data.js';
import { DateTime } from '../src/utils/datetime.js';

async function troubleshoot() {
  console.log('\n' + '='.repeat(70));
  console.log('VPS SCHEDULER TROUBLESHOOT');
  console.log('='.repeat(70) + '\n');

  try {
    // 1. Init database
    console.log('🔹 Connecting to PostgreSQL...');
    await initDatabase();
    console.log('✓ PostgreSQL connected\n');

    // 2. Check tenants
    console.log('🔹 Checking active tenants...');
    const tenants = await queryRows('SELECT id, name, slug FROM tenants WHERE is_active = 1');
    console.log(`✓ Found ${tenants.length} active tenant(s)\n`);
    tenants.forEach(t => console.log(`   - ${t.name} (${t.slug})`));
    console.log();

    // 3. Check brands per tenant
    console.log('🔹 Checking brands configuration...');
    for (const tenant of tenants) {
      const brands = await getBrands(tenant.id);
      console.log(`\n   Tenant: ${tenant.name}`);
      console.log(`   Brands: ${brands.length}`);
      brands.forEach(b => {
        console.log(`     - ${b.key} (${b.name}) - ${b.engine}`);
      });
    }
    console.log();

    // 4. Check latest data in snapshots
    console.log('🔹 Checking latest data snapshots...');
    const now = DateTime.now();
    const todayStr = now.toDateStr();
    const hour = now.hour;
    
    console.log(`   Today: ${todayStr}, Current hour: ${hour}\n`);

    for (const tenant of tenants) {
      const brands = await getBrands(tenant.id);
      for (const brand of brands.slice(0, 2)) { // Check first 2 brands only
        try {
          const snapshots = await queryRows(
            `SELECT hour, deposit_accepted_count, regis_total 
             FROM snapshots 
             WHERE brand_key = $1 AND date = $2 AND tenant_id = $3
             ORDER BY hour DESC LIMIT 5`,
            [brand.key, todayStr, tenant.id]
          );
          
          if (snapshots.length > 0) {
            console.log(`   ✓ ${brand.key}: ${snapshots.length} snapshots today`);
            snapshots.slice(0, 2).forEach(s => {
              console.log(`     - Hour ${s.hour}: TRX=${s.deposit_accepted_count}, REGIS=${s.regis_total}`);
            });
          } else {
            console.log(`   ⚠ ${brand.key}: NO DATA TODAY`);
          }
        } catch (err) {
          console.log(`   ✗ ${brand.key}: Error - ${err.message}`);
        }
      }
    }
    console.log();

    // 5. Check settings
    console.log('🔹 Checking Telegram settings...');
    const settings = await queryRows(
      `SELECT key, value FROM settings WHERE category = 'report' LIMIT 10`
    );
    console.log(`   Found ${settings.length} settings:\n`);
    for (const s of settings) {
      let display = s.value;
      if (s.key === 'tg_bot_token' && s.value) {
        display = s.value.substring(0, 10) + '...';
      }
      console.log(`   - ${s.key}: ${display}`);
    }
    console.log();

    // 6. Check job logs
    console.log('🔹 Checking recent job logs...');
    const logs = await queryRows(
      `SELECT brand_key, action, status, message, duration, created_at 
       FROM job_logs 
       ORDER BY created_at DESC 
       LIMIT 20`
    );
    console.log(`   Last 20 job logs:\n`);
    logs.forEach(log => {
      const icon = log.status === 'success' ? '✓' : '✗';
      const time = new Date(log.created_at).toLocaleTimeString();
      console.log(`   ${icon} [${time}] ${log.brand_key} - ${log.action} - ${log.status}`);
      if (log.message) console.log(`      ${log.message}`);
    });
    console.log();

    // 7. Recommendations
    console.log('='.repeat(70));
    console.log('RECOMMENDATIONS:\n');
    
    if (tenants.length === 0) {
      console.log('⚠️  No active tenants found!');
      console.log('   → Create a tenant first via admin dashboard\n');
    }

    const todayLogs = logs.filter(l => {
      const logDate = new Date(l.created_at).toDateString();
      return logDate === new Date().toDateString();
    });

    if (todayLogs.length === 0) {
      console.log('⚠️  No job logs today!');
      console.log('   → Scheduler might not be running');
      console.log('   → Check: pm2 list\n');
    }

    console.log('💡 To check PM2 status:');
    console.log('   pm2 list');
    console.log('   pm2 logs app-name');
    console.log('   ');
    console.log('💡 To manually trigger a report (test):\n');
    console.log('   node --env-file=.env scripts/test-now.js\n');

    console.log('='.repeat(70) + '\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }

  process.exit(0);
}

troubleshoot();
