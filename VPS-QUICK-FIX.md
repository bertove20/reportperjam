# 🚀 VPS QUICK FIX - Dependencies Installation

## ⚠️ PROBLEM
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'pg'
```

**Cause**: Dependencies not installed on VPS after pulling code.

---

## ✅ SOLUTION (Run on VPS)

### Option A: Automated Script (RECOMMENDED)

```bash
cd /var/www/html/reportperjam

# Make the script executable
chmod +x scripts/vps-quick-fix.sh

# Run it
./scripts/vps-quick-fix.sh
```

This will:
1. ✅ Remove old node_modules (clean state)
2. ✅ npm install (download dependencies)
3. ✅ Stop PM2
4. ✅ Restart PM2 with --update-env
5. ✅ Show status & recent logs

---

### Option B: Manual Commands

```bash
cd /var/www/html/reportperjam

# 1. Clean install
rm -rf node_modules package-lock.json
npm install

# 2. Stop PM2
pm2 stop tim-report-bot

# 3. Wait a moment
sleep 2

# 4. Restart with environment
pm2 restart tim-report-bot --update-env

# 5. Wait for startup
sleep 3

# 6. Check logs
pm2 logs tim-report-bot --lines 30
```

---

## 📊 What to Look For in Logs

### ✅ GOOD (after fix):
```
[23:09:10.463] INFO Multi-tenant scheduler started
[23:19:20.810] INFO PostgreSQL initialized (multi-tenant SaaS)
[23:19:20.911] INFO API server running on http://localhost:3000
```

### ❌ BAD (if still broken):
```
[ERR_MODULE_NOT_FOUND]: Cannot find package 'pg'
```
→ npm install didn't work or didn't complete.

---

## 🔍 Verification

After fix, wait for **next :05 minute mark** (when scheduler runs):

```bash
# Check reports are sending
pm2 logs tim-report-bot --lines 50 | grep -E "Tim report|report sent|Fetch"
```

**Expected to see**:
```
[HH:05:XX.XXX] INFO Tim report sent { brand: 'BRAND_A', hour: XX }
[HH:05:XX.XXX] INFO Tim report sent { brand: 'BRAND_B', hour: XX }
```

And **check Telegram group** - should receive hourly reports! 📸

---

## ⚡ If Still Not Working

Run diagnostic:

```bash
# Verify pg module is installed
node -e "import('pg').then(() => console.log('✅ pg module found'))"

# Show all installed modules
npm list pg

# Check database connectivity
node --env-file=.env scripts/debug-settings.js
```

Then share output with me!

