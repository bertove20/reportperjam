/**
 * Diagnostic Script — Cek status scheduler & Telegram configuration
 * 
 * Usage: node --env-file=.env scripts/diagnose-scheduler.js
 */

import { logger } from '../src/logger.js';

async function diagnose() {
  console.log('\n' + '='.repeat(60));
  console.log('SCHEDULER & TELEGRAM DIAGNOSTICS');
  console.log('='.repeat(60) + '\n');

  // 1. Check environment variables
  console.log('📋 ENVIRONMENT VARIABLES:');
  console.log(`  TG_BOT_TOKEN: ${process.env.TG_BOT_TOKEN ? '✓ Set (masked: ' + process.env.TG_BOT_TOKEN.substring(0, 10) + '...)' : '✗ NOT SET'}`);
  console.log(`  TG_REPORT_GROUP: ${process.env.TG_REPORT_GROUP ? '✓ ' + process.env.TG_REPORT_GROUP : '✗ NOT SET'}`);
  console.log(`  TZ (Timezone): ${process.env.TZ || '✗ NOT SET (default: UTC)'}`);
  console.log(`  PORT: ${process.env.PORT || '3000 (default)'}`);
  console.log(`  DATABASE_URL: ${process.env.DATABASE_URL ? '✓ Set' : '✗ NOT SET'}\n`);

  // 2. Check Telegram API connectivity
  console.log('🔗 TELEGRAM API CONNECTION:');
  const token = process.env.TG_BOT_TOKEN;
  const groupId = process.env.TG_REPORT_GROUP;

  if (!token || !groupId) {
    console.log('  ✗ Bot token or group ID missing - cannot test\n');
  } else {
    try {
      const url = `https://api.telegram.org/bot${token}/getMe`;
      const response = await fetch(url);
      const result = await response.json();

      if (result.ok) {
        console.log(`  ✓ Bot connected successfully`);
        console.log(`    Bot name: ${result.result.first_name}`);
        console.log(`    Bot username: @${result.result.username}\n`);
      } else {
        console.log(`  ✗ Bot connection failed: ${result.description}\n`);
      }
    } catch (err) {
      console.log(`  ✗ Connection error: ${err.message}\n`);
    }
  }

  // 3. Check group/channel
  console.log('👥 TELEGRAM TARGET:');
  if (!token || !groupId) {
    console.log('  ✗ Bot token or group ID missing\n');
  } else {
    try {
      const url = `https://api.telegram.org/bot${token}/getChat`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: groupId }),
      });
      const result = await response.json();

      if (result.ok) {
        console.log(`  ✓ Group/Channel found`);
        console.log(`    Type: ${result.result.type}`);
        console.log(`    Title: ${result.result.title || result.result.first_name}\n`);
      } else {
        console.log(`  ✗ Cannot access group: ${result.description}`);
        console.log(`    Make sure bot is a member of the group/channel\n`);
      }
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}\n`);
    }
  }

  // 4. Scheduler info
  console.log('⏰ SCHEDULER CONFIGURATION:');
  console.log(`  Cron Fetch (1-23 hours): 0 1-23 * * * (at :00)`);
  console.log(`  Cron Report (1-23 hours): 5 1-23 * * * (at :05)`);
  console.log(`  Cron Finish (daily): 5 0 * * * (00:05 every day)`);
  console.log(`  Timezone: ${process.env.TZ || 'Asia/Phnom_Penh'}\n`);

  // 5. Test message
  console.log('📨 SEND TEST MESSAGE:');
  if (!token || !groupId) {
    console.log('  ✗ Cannot send test - missing credentials\n');
  } else {
    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const testTime = new Date().toLocaleString('id-ID', { timeZone: process.env.TZ || 'Asia/Phnom_Penh' });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: groupId,
          text: `✅ <b>Scheduler Diagnostics OK</b>\n\n🤖 Bot: Aktif\n⏰ Waktu Server: ${testTime}\n\nReport akan mengirim setiap jam pada menit ke-05.`,
          parse_mode: 'HTML',
        }),
      });

      const result = await response.json();
      if (result.ok) {
        console.log('  ✓ Test message sent successfully!\n');
      } else {
        console.log(`  ✗ Failed to send test message: ${result.description}\n`);
      }
    } catch (err) {
      console.log(`  ✗ Error sending test: ${err.message}\n`);
    }
  }

  console.log('='.repeat(60));
  console.log('TIPS:');
  console.log('  1. Scheduler harus running di background (via PM2 atau systemd)');
  console.log('  2. Server log bisa dicek di: logs/bot.log');
  console.log('  3. Pastikan timezone di .env sesuai dengan lokasi Anda');
  console.log('  4. Bot harus menjadi member group/channel penerima report');
  console.log('='.repeat(60) + '\n');
}

diagnose().catch(err => {
  console.error('Diagnostic error:', err.message);
  process.exit(1);
});
