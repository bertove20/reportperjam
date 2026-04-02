/**
 * Manual Report Trigger — Test generate & send report NOW
 * 
 * Usage: node --env-file=.env scripts/trigger-report.js [HOUR] [DATE]
 * 
 * Examples:
 *   node scripts/trigger-report.js                  # Test current hour
 *   node scripts/trigger-report.js 14               # Test hour 14:00
 *   node scripts/trigger-report.js 0                # Test FINISH report
 *   node scripts/trigger-report.js 5 2026-04-01     # Test specific hour/date
 */

import { initDatabase } from '../src/storage/postgres.js';
import { getBrands } from '../src/tim/brand-configs.js';
import { sendTimReports } from '../src/tim/tim-orchestrator.js';
import { DateTime } from '../src/utils/datetime.js';
import { logger } from '../src/logger.js';

async function trigger() {
  console.log('\n' + '='.repeat(70));
  console.log('MANUAL REPORT TRIGGER');
  console.log('='.repeat(70) + '\n');

  try {
    // 1. Init database
    console.log('🔹 Connecting database...');
    await initDatabase();
    console.log('✓ Connected\n');

    // 2. Parse arguments
    let hour = parseInt(process.argv[2]);
    let date = process.argv[3];

    const now = DateTime.now();
    
    if (isNaN(hour)) {
      hour = now.hour;
      console.log(`📌 No HOUR specified, using current: ${hour}`);
    }

    if (!date) {
      date = now.toDateStr();
      console.log(`📌 No DATE specified, using today: ${date}`);
    }

    console.log(`\n📊 Trigger Details:`);
    console.log(`   Hour: ${hour === 0 ? 'FINISH (00:00)' : `${String(hour).padStart(2, '0')}:00`}`);
    console.log(`   Date: ${date}`);
    console.log(`   Yesterday: ${now.yesterday().toDateStr()}\n`);

    // 3. Get tenants
    const { queryRows } = await import('../src/storage/postgres.js');
    const tenants = await queryRows('SELECT id, name, slug FROM tenants WHERE is_active = 1');
    
    console.log(`🔹 Found ${tenants.length} active tenant(s)\n`);

    // 4. Trigger for each tenant
    for (const tenant of tenants) {
      console.log(`📤 Sending report for tenant: ${tenant.name}\n`);
      
      try {
        await sendTimReports(
          hour,
          date,
          now.yesterday().toDateStr(),
          null,
          tenant.id
        );
        console.log(`✓ Report sent successfully!\n`);
      } catch (err) {
        console.error(`✗ Error: ${err.message}\n`);
      }
    }

    console.log('='.repeat(70));
    console.log('ℹ️  Report sent! Check Telegram group now.\n');
    console.log('Next: Monitor scheduler');
    console.log('   tail -f logs/bot.log | grep "Tim report"');
    console.log('   pm2 logs app | grep "Tim report"\n');
    console.log('='.repeat(70) + '\n');

    process.exit(0);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

trigger();
