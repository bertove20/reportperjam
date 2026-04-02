# LANGKAH CEPAT: Fix Report Tidak Terkirim di VPS

## 📋 Quick Start (5 menit)

### 1️⃣ SSH ke VPS
```bash
ssh root@your-vps-ip
cd /opt/reportperjam
```

### 2️⃣ Check Status Process
```bash
pm2 list
```

**Status yang baik:**
- Kolom `status` menunjukkan: `online`
- Kolom `↺ restart` = 0 (tidak banyak restart)

**Jika tidak online/banyak restart:**
```bash
# Lihat error
pm2 logs app --lines 50

# Atau cek error log
tail -50 ~/.pm2/logs/app-error.log

# Restart
pm2 restart app
```

---

### 3️⃣ Test Manual Report
```bash
# Trigger report sekarang (untuk jam ini)
node --env-file=.env scripts/trigger-report.js

# Atau test jam spesifik
node --env-file=.env scripts/trigger-report.js 14

# Atau test FINISH report
node --env-file=.env scripts/trigger-report.js 0
```

**Hasil yang diharapkan:**
```
✓ Report sent successfully!
(Telegram group akan menerima 1 report)
```

---

### 4️⃣ Monitor Scheduler Real-time
```bash
# Terminal 1: Lihat log aplikasi
pm2 logs app

# Terminal 2 (di local): Tunggu jam berikutnya...
# Contoh: jika sekarang jam 14:30, tunggu jam 15:00 & 15:05
# Cari di log: "Fetch starting" (15:00) dan "Tim report sent" (15:05)
```

---

## 🆘 Jika Report Masih Tidak Terkirim

**Diagnose lengkap:**
```bash
# 1. Cek konfigurasi
node --env-file=.env scripts/diagnose-scheduler.js

# 2. Cek database & data
node --env-file=.env scripts/troubleshoot-reports.js

# 3. Lihat log error
pm2 logs app --lines 100 | grep -i error
tail -100 logs/bot.log | grep -i error
```

**Fix Umum:**

| Masalah | Solusi |
|---------|---------|
| "Database not initialized" | Check `DATABASE_URL` di `.env`, pastikan PostgreSQL running |
| "TG_REPORT_GROUP not set" | Check `TG_BOT_TOKEN` & `TG_REPORT_GROUP` di `.env` |
| "No data" | Check brand yang fetch datanya, verify API endpoint accessible |
| "process crash" | Lihat `pm2 logs`, restart dengan `pm2 restart app`, check memory |
| "timezone wrong" | Check `date` di VPS vs `TZ=` di `.env`, sesuaikan timezone |

---

## ✅ Checklist Akhir

Sebelum declare sukses, verify:

```bash
# 1. Process running
pm2 list | grep online

# 2. Database connected
psql -U postgres -d reportbot -c "SELECT COUNT(*) FROM snapshots;"

# 3. Manual test berhasil
node --env-file=.env scripts/trigger-report.js

# 4. Lihat log scheduler jalan
tail -50 logs/bot.log | tail -20

# 5. Detiknya sesuai (cek jam berikutnya)
date  # catat waktu
# Tunggu sampai menit ke-05 jam berikutnya
tail -f logs/bot.log | grep "Tim report sent"
```

---

## 📋 Detailed Troubleshooting

Lihat file: **TROUBLESHOOT-SCHEDULER.md** untuk debugging lebih detail.

```bash
cat TROUBLESHOOT-SCHEDULER.md
```

---

**Need help?** Share output dari:
```bash
pm2 list
node --env-file=.env scripts/troubleshoot-reports.js
tail -100 logs/bot.log
```
