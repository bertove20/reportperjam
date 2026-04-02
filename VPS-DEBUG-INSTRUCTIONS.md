# 🔧 STEP-BY-STEP DEBUG INSTRUCTIONS (VPS)

Solusi masalah `TG_REPORT_GROUP not set` dengan akurat.

---

## STEP 1: Pull latest code

```bash
cd /var/www/html/reportperjam
git pull origin main
```

**Expected**: Akan ada 3 commits baru (debug-settings, fix settings-store, fix postgres.js)

---

## STEP 2: Stop PM2 process

```bash
pm2 stop tim-report-bot
sleep 2
```

---

## STEP 3: Run DEBUG script (JANGAN JALANKAN SERVER, HANYA DEBUG)

```bash
cd /var/www/html/reportperjam
node --env-file=.env scripts/debug-settings.js
```

**CAPTURE SELURUH OUTPUT DARI SCRIPT INI**

Script akan menunjukkan:
- ✅ Daftar tenants
- ✅ SEMUA settings yang ada di database (dump lengkap)
- ✅ Hasil getSetting() untuk setiap tenant
- ✅ Raw SQL query result
- ✅ Environment variables status

---

## STEP 4: Verify database dari psql

```bash
psql -U postgres -h localhost -d reportbot -W -c "
SELECT key, module, tenant_id, value FROM settings 
WHERE module IN ('report', 'global') 
ORDER BY module, tenant_id DESC, key;
"
```

**When prompted, enter password for postgres user**

**CAPTURE OUTPUT INI JUGA**

---

## STEP 5: Verify tenants

```bash
psql -U postgres -h localhost -d reportbot -W -c "
SELECT id, name, slug, is_active FROM tenants;
"
```

---

## STEP 6: Check if tg_report_group exists di settings table

```bash
psql -U postgres -h localhost -d reportbot -W -c "
SELECT key, module, tenant_id, value FROM settings WHERE key = 'tg_report_group';
"
```

**Important**: Harus ada ROW untuk key ini!

Kalau empty → TAMBAH MANUAL (jangan lupa password):

```bash
psql -U postgres -h localhost -d reportbot -W <<EOF
INSERT INTO settings (key, module, tenant_id, value, updated_at)
VALUES ('tg_report_group', 'report', 1, '-4993466682', NOW())
ON CONFLICT(key, module, tenant_id) DO UPDATE SET value = '-4993466682', updated_at = NOW();

INSERT INTO settings (key, module, tenant_id, value, updated_at)
VALUES ('tg_bot_token', 'report', 1, '8663808582:AAGmg1FALVan1s7AQK9VPsPPxzaAVyit7LY', NOW())
ON CONFLICT(key, module, tenant_id) DO UPDATE SET value = '8663808582:AAGmg1FALVan1s7AQK9VPsPPxzaAVyit7LY', updated_at = NOW();

SELECT * FROM settings WHERE key IN ('tg_report_group', 'tg_bot_token');
EOF
```

---

## STEP 7: Jalankan debug script LAGI untuk verifikasi

```bash
node --env-file=.env scripts/debug-settings.js
```

Harus menunjukkan:
```
Tenant 1 (default): getSetting() → "-4993466682"
```

---

## STEP 8: Restart PM2

```bash
pm2 restart tim-report-bot --update-env
sleep 3
```

---

## STEP 9: Monitor logs

```bash
pm2 logs tim-report-bot --lines 50 | grep -E "ERROR|WARN|Tim report|report sent|Fetch starting"
```

**CAPTURE OUTPUT SETELAH HAM :05 BERIKUTNYA**

---

## EXPECTED OUTPUT setelah fixes:

```
[23:05:00.XX] INFO (xxx): Tim report sent { brand: 'BRAND_A', hour: 23 }
[23:05:01.XX] INFO (xxx): Tim report sent { brand: 'BRAND_B', hour: 23 }
...
[23:05:08.XX] INFO (xxx): Tim report cycle complete { successCount: 3, total: 3 }
```

---

## Share dengan saya:

1. ✅ Output dari `debug-settings.js`
2. ✅ Output dari `psql` queries (tenants & settings)
3. ✅ PM2 logs SETELAH restart (khususnya jam :05)
4. ✅ Screenshot dari Telegram group (apakah sudah terima report?)

---

## Kalau masih tidak work setelah ini:

Bisa ada issue dengan:
- Tenant ID mismatch (settings untuk tenant_id 1, tapi scheduler jalankan tenant_id lain)
- Multi-tenant query error
- PM2 environment variable not loaded properly

Tapi dengan debug script ini, kita akan lihat EXACTLY apa yang terjadi.

