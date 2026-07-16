#!/bin/bash
# VPS Quick Fix — Install dependencies & restart PM2
# Run this on the VPS immediately

set -e

echo "🚀 TIM REPORT BOT - QUICK FIX"
echo "========================================"

cd /var/www/html/reportperjam

echo ""
echo "📦 Step 1: Check if node_modules exists"
if [ -d "node_modules" ]; then
  echo "   ✅ node_modules exists"
  echo "   (Removing and reinstalling to ensure clean state)"
  rm -rf node_modules
  rm -f package-lock.json
else
  echo "   ℹ️  node_modules not found"
fi

echo ""
echo "📥 Step 2: Install dependencies"
npm install --production=false

echo ""
echo "✅ Dependencies installed!"

echo ""
echo "🛑 Step 3: Stop PM2 process"
pm2 stop tim-report-bot

echo ""
echo "🔄 Step 4: Restart with updated environment"
pm2 restart tim-report-bot --update-env

echo ""
echo "⏳ Waiting 3 seconds..."
sleep 3

echo ""
echo "📊 Step 5: Check process status"
pm2 status

echo ""
echo "📋 Step 6: Check recent logs (last 20 lines)"
pm2 logs tim-report-bot --lines 20 --nostream

echo ""
echo "✅ QUICK FIX COMPLETE!"
echo ""
echo "If you still see errors:"
echo "  1. Check: pm2 logs tim-report-bot --lines 50"
echo "  2. Wait until next :05 minute mark for report cycle"
echo "  3. Screenshot Telegram group to verify reports arriving"
echo ""
