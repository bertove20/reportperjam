# Troubleshoot Report Tidak Terkirim — VPS Checklist

## 🔍 STEP 1: Pastikan Process Running

```bash
# Login ke VPS
ssh root@your-vps-ip

# Check status PM2
cd /opt/reportperjam
pm2 list

# Jika process mati, restart
pm2 start ecosystem.config.cjs
# atau
pm2 restart app

# Save PM2 list ke startup
pm2 save
pm2 startup
```

**Output yang diharapkan:**
```
┌─────┬──────────────┬─────────┬─────────┬─────────┬──────────┐
│ id  │ name         │ version │ mode    │ status  │ ↺ restart│
├─────┼──────────────┼─────────┼─────────┼─────────┼──────────┤
│ 0   │ app          │ 2.0.0   │ cluster │ online  │ 0        │
└─────┴──────────────┴─────────┴─────────┴─────────┴──────────┘
```

---

## 🔍 STEP 2: Cek Log Real-time

```bash
# Lihat log 100 baris terakhir
tail -100 logs/bot.log

# Atau tail -f untuk monitor real-time
tail -f logs/bot.log

# Cek PM2 log juga
pm2 logs app

# Atau log spesifik
tail -f ~/.pm2/logs/app-out.log
tail -f ~/.pm2/logs/app-error.log
```

**Cari log seperti ini untuk tanda scheduler berjalan:**
```
{"msg":"Fetch starting", "hour":2}
{"msg":"5 1-23 * * * starting"}
{"msg":"Tim report sent"}
```

---

## 🔍 STEP 3: Run Troubleshoot Script

```bash
cd /opt/reportperjam
node --env-file=.env scripts/troubleshoot-reports.js
```

Script ini akan mengecek:
- ✓ Koneksi PostgreSQL
- ✓ Tenant aktif
- ✓ Brand configuration
- ✓ Data snapshot di database
- ✓ Telegram settings
- ✓ Job logs terakhir

---

## 🔍 STEP 4: Test Manual Report

```bash
# Test: Fetch data sekarang
node --env-file=.env scripts/test-fetch.js

# Test: Generate & kirim report ke Telegram
node --env-file=.env scripts/test-now.js
```

---

## ⚙️ STEP 5: Fix Umum

### A. Process Mati Terus-terusan?
**Lihat error di log:**
```bash
tail -50 ~/.pm2/logs/app-error.log
```

**Kemungkinan:**
- Database tidak bisa diakses → cek `DATABASE_URL` di `.env`
- Port 3000 sudah pakai → ubah `PORT` di `.env`
- Memory habis → tambah swap atau gunakan `cluster mode`

**Restart dengan debug:**
```bash
pm2 stop app
node --env-file=.env src/server.js  # Jalankan manual, lihat error
```

---

### B. Data Kosong?
**Cek snapshot di database:**
```bash
psql -U postgres -d reportbot -c "
SELECT brand_key, date, hour, deposit_accepted_count, regis_total
FROM snapshots
WHERE date = CURRENT_DATE
ORDER BY hour DESC
LIMIT 10;
"
```

**Jika kosong → Brand fetch gagal:**
- Cek cookies/credentials brand sudah benar
- Cek domain brand bisa diakses
- Cek firewall VPS

```bash
# Test akses domain brand
curl -I https://asia77cash.com
wget --head https://asia77cash.com
```

---

### C. Scheduler Tidak Berjalan?
**Cek timezone .env sesuai VPS:**
```bash
# Di VPS, check timezone sistem
date
timedatectl

# Di .env, pastikan TZ sesuai:
grep "^TZ=" .env
```

**Timezone yang umum:**
- `Asia/Jakarta` (Indonesia)
- `Asia/Bangkok` (Thailand)
- `Asia/Ho_Chi_Minh` (Vietnam)
- `Asia/Singapore`

**Update .env jika perlu, restart:**
```bash
vi .env  # Edit TZ=
pm2 restart app
```

---

### D. Telegram Bot Tidak Terkoneksi?
```bash
# Test Telegram API
curl -X POST https://api.telegram.org/bot<YOUR_TOKEN>/sendMessage \
  -d "chat_id=<GROUP_ID>&text=Test"

# Pastikan di .env
grep "^TG_" .env

# Restart untuk load env baru
pm2 restart app
```

---

## 📊 Monitoring Scheduler

**Cek cron schedule yang sedang berjalan:**
```bash
# Lihat log per jam
tail -f logs/bot.log | grep "Fetch\|Report\|FINISH"

# Atau filter per brand
tail -f logs/bot.log | grep "BRAND_E"
```

**Expected pattern setiap jam:**
```
01:00 - Fetch dimulai untuk semua brand
01:05 - Report dikirim ke Telegram
          (FINISH report dikirim jam 00:05 pagi)
```

---

## 🆘 Kalau Masih Tidak Bisa?

1. **Ambil semua error message dari log**
2. **Jalankan troubleshoot script**
3. **Share output dari:**
   ```bash
   pm2 list
   pm2 logs app | head -50
   node --env-file=.env scripts/troubleshoot-reports.js 2>&1 | head -100
   ```

---

## ✅ Checklist Akhir

- [ ] Process PM2 online (`pm2 list` show status: online)
- [ ] Database connected (tidak ada connection error di log)
- [ ] Timezone di .env sesuai VPS (`date` dan `TZ=` match)
- [ ] Telegram credentials benar (bot token & group ID ada)
- [ ] Data brand ada di database (troubleshoot script menunjukkan snapshots)
- [ ] Manual test berhasil (`test-now.js` mengirim report)
- [ ] Log menunjukkan scheduler running (grep "Fetch starting" di log)

Jika semua checklist ✓, scheduler seharusnya mengirim report otomatis setiap jam!
