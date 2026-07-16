# Tim Hourly Report Bot

Multi-tenant Fastify + React + PostgreSQL SaaS untuk **laporan hourly per brand** dan **referral analytics** ke Telegram. Fetch data dari panel brand setiap jam, render PNG, kirim ke grup Telegram. Mendukung beberapa engine panel berbeda (asia77 cookie-based, syntech JWT-based) dengan dispatcher per-brand.

> Aktif di production: `https://report.grup138.com` (VPS UpCloud Singapore, multi-brand multi-divisi).

---

## Daftar Isi

- [Fitur](#fitur)
- [Konsep & Alur](#konsep--alur)
- [Engine Panel yang Didukung](#engine-panel-yang-didukung)
- [Setup VPS Awal](#setup-vps-awal)
- [Operasi Harian](#operasi-harian)
- [Fitur Detail](#fitur-detail)
- [Troubleshooting](#troubleshooting)
- [IPv6 Permanen Fix](#ipv6-permanen-fix-sangat-penting)
- [Update / Deploy Workflow](#update--deploy-workflow)
- [Struktur Kode](#struktur-kode)

---

## Fitur

**Hourly Report Brand:**
- Fetch TRX (deposit accepted) dan REGIS (registrasi) per jam dari panel brand
- Render PNG screenshot per brand → kirim ke grup Telegram setiap `:03` (data fresh, bukan stale)
- Tabel 24 baris (jam 1-23 + FINISH) dengan kolom KMRN / HARI INI / SELISIH/JAM / SELISIH KMRN — kedua kolom selisih diwarnai hijau (positif) / merah (negatif)
- Header card: nama brand + tanggal lengkap + jam update + warna primary brand
- Scoreboard, projection (pace, est EOD, target, selisih), trend bar 24-jam
- Auto-recovery: jam yang kosong di-isi forward-fill saat fetch berikutnya
- **Backfill manual** dari halaman Hourly Report — fetch data per-jam dari panel untuk tanggal lalu
- **Import CSV** untuk fill data yang panel tidak bisa kasih lagi:
  - Format `brand,date,hour,trx,regis` (long format, 1 baris per data point)
  - Partial update: cell `trx` atau `regis` kosong = preserve nilai existing
  - Multi-brand multi-tanggal dalam 1 file
  - Download template + preview di modal sebelum import

**Referral Report (per divisi):**
- Per divisi punya N referral codes (mapping brand → kode → divisi)
- Daily cron `00:05` fetch new + depo per referral code, simpan snapshot
- Render PNG **per referral card** (1 image per referral, bukan 1 image gabungan) — bisa fan-out ke multiple Telegram group per divisi
- Dashboard: monthly Excel-style breakdown per (brand, referral) dengan persentase conversion
- **Tombol Kirim per row**: trigger send manual untuk 1 referral spesifik
- **Tombol Backfill per row**: fill snapshot range tanggal untuk 1 referral saja (ringan, ~30 request vs 168 untuk bulk divisi)
- Pencarian (filter live) di Dashboard untuk cari brand/code/keterangan

**Multi-Tenant SaaS Infra:**
- Tabel `tenants` jadi root data isolation, semua tabel domain punya `tenant_id`
- Scheduler iterate semua tenant aktif setiap cron tick
- User permissions per-modul (`report`, `finance`, ...) dengan brand_scope
- Sidebar dinamis: grup yang user tidak punya akses tidak muncul

**Sistem Global:**
- User management (superadmin only)
- Divisi: bisa multiple Telegram group ID per divisi (newline/comma separated), report fan-out ke semuanya
- Auto-cleanup `job_logs` setiap tanggal 1 jam 00:30 — hapus log dari bulan-bulan lalu

**Keuangan (modul terpisah, opsional):**
- Bank/Wallet, Brand & Budget, Saldo, Kategori, Tim, Pinjaman, Laporan
- Audit log untuk setiap perubahan

---

## Konsep & Alur

### Entitas data

```
tenant ──┬── divisions ──┬── users
         │               └── referral_codes ── (brand_key, division)
         ├── report_brands (engine, credentials, IDUS/cookie/JWT, color, logo)
         ├── hourly_snapshots (brand, date, hour, trx, regis)  ← report data
         ├── referral_daily_snapshots (date, division, brand, code, new/depo)
         ├── settings (key, module, value)
         ├── job_logs
         └── audit_logs
```

### Cron schedule (timezone Asia/Phnom_Penh = UTC+7 = WIB)

| Cron | Waktu | Aksi |
|---|---|---|
| `0 1-23 * * *` | `:00` jam 1-23 | **Syntech fetch**: fetch brand syntech saja (panel real-time, tidak ada cache). Snapshot tepat di pergantian jam = paling akurat. **Belum kirim report** — data disimpan ke DB, report ditahan sampai `:03`. |
| `3 1-23 * * *` | `:03` jam 1-23 | **Asia77 fetch + SEMUA brand kirim report**: refresh session asia77 → fetch asia77 brands (data fresh setelah cache clear) → recovery missing hours (semua engine) → render + kirim report **semua brand** (syntech + asia77 bareng). Hasilnya semua report muncul di waktu yang sama di Telegram. |
| `5 0 * * *` | `00:05` | **FINISH syntech**: fetch + kirim Tim report FINISH brand **syntech saja** (panel real-time). Lalu kirim info ke grup bahwa report asia77 menyusul ±00:30. |
| `30 0 * * *` | `00:30` | **FINISH asia77 + Referral**: keepalive session asia77 → fetch ulang FINISH brand **asia77** (data panel sudah update setelah delay pergantian hari) → kirim report → trigger `sendReferralReports` per divisi. Waktu sama persis dengan info yang diumumkan di 00:05. |
| `*/10 * * * *` | every 10 min | **Keepalive**: ping panel asia77 (`/clearMessage` + `/sse/user/balance`) supaya cookie session tidak expire (7 ping/jam: 6x dedicated + 1x pre-fetch refresh). Syntech tidak butuh (JWT stateless). Alert ke Telegram kalau 3x gagal berturut (30 menit). |
| `50 0 1 * *` | tanggal 1 jam `00:50` | **Cleanup logs**: `DELETE FROM job_logs WHERE created_at < date_trunc('month', NOW())` |

### Alur pipeline hourly (2 cron, 1 batch kirim)

```
:00 ─── Syntech fetch (cron pertama) ───
  tenant N → getBrands(N) → filter engine='syntech' →
    fetchSyntechDaily(brand) → GET /services/transactions/summary → deposit_action_accepted_count
    fetchSyntechRegis(brand) → GET /services/players → meta.total
    → upsertSnapshot(brand, date, hour, trx, regis, tenantId)
    → SIMPAN KE DB SAJA, belum kirim report

:03 ─── Asia77 fetch + SEMUA brand kirim (cron kedua) ───
  tenant N → getBrands(N) →

  Step 0: Pre-fetch refresh (asia77 only)
    └── per brand asia77: keepaliveAsia77(clearMessage + sse/user/balance)
        → invalidate server-side cache panel

  Step 1: Fetch asia77 brands (syntech sudah di-fetch di :00)
    └── fetchAsia77Daily(brand) → POST /daily/info/list → dpapp
        fetchAsia77Regis(brand) → POST /memberlist (paginated) → count
        → upsertSnapshot(brand, date, hour, trx, regis, tenantId)

  Step 2: Recovery missing hours — semua engine (forward-fill)

  Step 3: Render + kirim report SEMUA brand (tanpa filter engine)
    └── loop semua brand (syntech + asia77) → render HTML → screenshot PNG → sendPhoto
        → semua report muncul BARENG di Telegram group (~:03-:05)
```

**Kenapa 2 cron tapi 1 batch kirim**: setiap engine punya timing fetch optimal yang berbeda (syntech real-time di `:00`, asia77 perlu cache refresh jadi `:03`). Tapi report harus muncul bersamaan di Telegram supaya operator tidak bingung lihat report terpecah. Solusinya: fetch di waktu masing-masing, kirim bareng di `:03`.

### Alur referral fetch

```
divisi → group referrals by brand → per brand → per referral code:
  fetchReferralMembers(brand, date, 'new', code)   → count = new_regis
  fetchReferralMembers(brand, date, 'depo', code)  → count = depo_regis

`fetchReferralMembers` adalah engine-agnostic dispatcher:
  asia77 → fetchMembersFiltered({newmb: true|false, refusnm: [code]})
  syntech → fetchSyntechMembersFiltered({depositFilter: 'eq0'|'gt0', referredBy: code})

  → upsertReferralDailySnapshot(tenantId, divisionId, brand, code, date, new, depo)
  → render PNG per card (1 image = 1 referral)
  → sendPhotoMulti(groupIds, png, caption, tenantId)
```

### Engine separation contract

Setiap titik di kode yang fetch data dispatch by `brand.engine`, **tidak ada hard-code engine** kecuali di file engine itu sendiri:

| Lokasi | Tujuan |
|---|---|
| [src/api/fetch-brand.js:43,56,105,120](src/api/fetch-brand.js#L43) | Hourly + FINISH fetch |
| [src/routes/actions.js:150,211](src/routes/actions.js#L150) | Backfill manual button |
| [src/routes/brands.js:195,205](src/routes/brands.js#L195) | Test connection button |
| [src/tim/referral-report-orchestrator.js:48](src/tim/referral-report-orchestrator.js#L48) | Referral fetch via `fetchReferralMembers` helper |

Adding engine ke-3 = tambah file engine + import di 5 lokasi dispatcher di atas + `else if` branch. Tidak butuh refactor besar.

---

## Engine Panel yang Didukung

### Engine A: asia77 (cookie-based)

Untuk panel berbasis Cloudflare yang pakai session cookie. Implementasi: [src/api/asia77-engine.js](src/api/asia77-engine.js). Pakai `got-scraping` untuk mimic TLS fingerprint Chrome.

**Auth flow:**
1. User login manual via browser (host yang IP-nya whitelisted, biasanya pakai SSH SOCKS tunnel ke VPS)
2. Copy cookie dari DevTools → paste di Admin → Brands → Edit → field Cookie Header
3. **Keepalive cron** ping `/clearMessage` + `/sse/user/balance` setiap 10 menit supaya session tidak expire (7x ping/jam: 6x keepalive + 1x pre-fetch refresh)
4. Saat session expired (deteksi `ec=undefined` / `ec=-1`), alert ke Telegram setelah 3x gagal berturut → user paste cookie baru

**Endpoint:**
- `POST /daily/info/list` → `dpapp` = TRX accepted
- `POST /memberlist` → list member (parse `join_time` untuk hourly REGIS)
- `POST /sse/user/balance` → keepalive

**Field per brand:** `domain`, `cookie_header`, `user_id` (IDUS), `tenant_id`

### Engine B: syntech / WIS (JWT-based)

Untuk panel WIS-style. Implementasi: [src/api/syntech-engine.js](src/api/syntech-engine.js). Stateless server, tidak butuh keepalive.

**Auth flow:**
1. `POST /services/login` body `{username, password, hash, remember}` → return JWT
2. (optional) `POST /services/pin/validate` body `{input: posisi-PIN, hash}` → unlock menu
3. Pakai header `Authorization: Bearer <jwt>` di semua request
4. **Auto re-auth on 401**: kalau JWT expired, engine otomatis re-login

**Variant joko77.spdinf.com**: butuh **2 field tambahan** yang harus dicapture sekali dari DevTools:
- `auth_api_key` → dikirim sebagai header `x-data-reference: <UUID>`
- `auth_hash` → dikirim sebagai field `hash` di body login

Tanpa kedua field ini, panel return `403 Invalid API Key` atau `400 Invalid hash`. Cara cari:
1. Login manual ke panel via browser
2. DevTools → Network → klik request `/services/login` → copy `x-data-reference` header dan `hash` di Payload
3. Paste di Admin → Brands → Edit → Syntech Settings → API Key + Login Hash

**Token cache:** `Map<domain, {token, expiry}>` per-domain, bukan global. Multiple brand syntech aman tidak saling override.

**Endpoint:**
- `POST /services/login` → JWT
- `POST /services/pin/validate` → unlock
- `GET /services/transactions/summary?date=...&new_player=false` → `deposit_action_accepted_count`
- `GET /services/players?start_date=...&end_date=...&...` → list player + `meta.total`
- `GET /services/players?...&total_deposit=eq0` → New Player (belum deposit)
- `GET /services/players?...&total_deposit=gt0` → Non-New Player (sudah deposit)
- `GET /services/players?...&referred_by=<code>&referred=true` → filter referral

**Field per brand:** `domain`, `auth_user`, `auth_pass` (encrypted), `auth_pin` (encrypted, optional), `auth_api_key` (encrypted, optional), `auth_hash` (encrypted, optional), `tenant_id`

### Cara tambah engine ke-3 di masa depan

1. Buat `src/api/<name>-engine.js` dengan function `fetch<Name>Daily`, `fetch<Name>Regis`, dan optional `fetch<Name>MembersFiltered` untuk referral
2. Tambah `else if (brand.engine === '<name>')` branch di:
   - [src/api/fetch-brand.js](src/api/fetch-brand.js) (hourly + FINISH)
   - [src/routes/actions.js](src/routes/actions.js) (backfill route)
   - [src/routes/brands.js](src/routes/brands.js) (test endpoint)
   - [src/tim/referral-report-orchestrator.js](src/tim/referral-report-orchestrator.js) (`fetchReferralMembers` dispatcher)
3. Tambah opsi di dropdown engine [admin/src/pages/report/BrandForm.jsx](admin/src/pages/report/BrandForm.jsx)
4. Kalau engine butuh field credential baru (selain yang sudah ada), follow pattern `auth_api_key`/`auth_hash`: schema column → brand-store create/update → brand-configs decrypt → BrandForm input → routes encrypt/mask

---

## Setup VPS Awal

Production menggunakan UpCloud Singapore (`213.163.201.225`), Ubuntu, hostname `report.grup138.com`, di belakang Cloudflare proxy. Path deploy: `/var/www/html/reportperjam`. Berikut steps lengkap dari nol.

### STEP 1: Cloudflare DNS

DNS → Add record:
```
Type: A
Name: report
Content: 213.163.201.225
Proxy status: Proxied (orange cloud ON)
TTL: Auto
```

SSL/TLS → Overview → Mode: **Full**
SSL/TLS → Origin Server → **Authenticated Origin Pulls: ON**

### STEP 2: SSH ke VPS + system update

```bash
ssh root@213.163.201.225
apt update && apt upgrade -y
```

### STEP 3: Disable IPv6 (krusial — sebelum install apapun)

Lihat section [IPv6 Permanen Fix](#ipv6-permanen-fix-sangat-penting) dan terapkan **3-layer fix** sekarang. Tanpa ini, semua brand fetch akan kena timeout misterius karena `got-scraping` happy-eyeballs ke IPv6 yang routing-nya rusak di banyak VPS Singapore.

### STEP 4: Install Node.js, Nginx, Chromium, PM2

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Nginx
apt install -y nginx

# Chromium + dependencies untuk Puppeteer
apt install -y chromium-browser fonts-liberation libappindicator3-1 \
  libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libcups2t64 \
  libdbus-1-3 libdrm2 libgbm1 libgtk-3-0t64 libnspr4 libnss3 \
  libxcomposite1 libxdamage1 libxrandr2 xdg-utils ca-certificates \
  fonts-freefont-ttf git build-essential

# Catat path chromium untuk .env
which chromium-browser || which chromium

# PostgreSQL
apt install -y postgresql postgresql-contrib

# PM2
npm install -g pm2
```

### STEP 5: Setup PostgreSQL

```bash
sudo -u postgres psql <<'EOF'
CREATE DATABASE reportbot;
ALTER USER postgres WITH PASSWORD 'postgres';
EOF
```

(Ganti password kalau di production. Untuk dev/staging, default `postgres/postgres` cukup.)

### STEP 6: Clone & install project

```bash
cd /var/www/html
git clone https://github.com/bertove20/reportperjam.git
cd reportperjam

# Install backend dependencies
npm install

# Install + build frontend
cd admin && npm install && npm run build && cd ..

# Buat folder yang dibutuhkan runtime
mkdir -p data logs assets/logos
```

### STEP 7: Buat .env

```bash
ENCRYPTION_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)

cat > /var/www/html/reportperjam/.env <<ENVEOF
# Telegram bot
TG_BOT_TOKEN=8663808582:AAGmg1FALVan1s7AQK9VPsPPxzaAVyit7LY
TG_REPORT_GROUP=-4993466682

# Timezone
TZ=Asia/Phnom_Penh

# Server
PORT=3000
ENCRYPTION_KEY=$ENCRYPTION_KEY
JWT_SECRET=$JWT_SECRET

# PostgreSQL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reportbot
PG_HOST=localhost
PG_PORT=5432
PG_DB=reportbot
PG_USER=postgres
PG_PASS=postgres

# Puppeteer (sesuaikan dengan output 'which chromium-browser' di STEP 4)
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENVEOF
```

### STEP 8: Nginx + Cloudflare Authenticated Origin Pull

```bash
# Download Cloudflare Origin Pull CA
curl -o /etc/nginx/cf-origin-pull.pem \
  https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem
```

Generate Origin Certificate dari Cloudflare → SSL/TLS → Origin Server → Create Certificate (hostname `report.grup138.com`, validity 15 years), lalu paste:

```bash
cat > /etc/nginx/cf-origin-cert.pem << 'CERTEOF'
-----BEGIN CERTIFICATE-----
PASTE_CERTIFICATE_DARI_CLOUDFLARE_DISINI
-----END CERTIFICATE-----
CERTEOF

cat > /etc/nginx/cf-origin-key.pem << 'KEYEOF'
-----BEGIN PRIVATE KEY-----
PASTE_PRIVATE_KEY_DARI_CLOUDFLARE_DISINI
-----END PRIVATE KEY-----
KEYEOF

chmod 600 /etc/nginx/cf-origin-key.pem
```

Buat nginx config:

```bash
cat > /etc/nginx/sites-available/reportperjam << 'NGINXEOF'
# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name report.grup138.com;
    return 301 https://$host$request_uri;
}

# Block direct IP HTTP
server {
    listen 80 default_server;
    server_name _;
    return 444;
}

# Block direct IP HTTPS
server {
    listen 443 ssl default_server;
    server_name _;
    ssl_certificate /etc/nginx/cf-origin-cert.pem;
    ssl_certificate_key /etc/nginx/cf-origin-key.pem;
    return 444;
}

# Main server — hanya Cloudflare yang boleh akses
server {
    listen 443 ssl;
    server_name report.grup138.com;

    ssl_certificate /etc/nginx/cf-origin-cert.pem;
    ssl_certificate_key /etc/nginx/cf-origin-key.pem;

    # Authenticated Origin Pull — HANYA Cloudflare yang boleh connect
    ssl_client_certificate /etc/nginx/cf-origin-pull.pem;
    ssl_verify_client on;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Serve admin SPA static
    root /var/www/html/reportperjam/admin/dist;
    index index.html;

    # API → proxy ke Fastify
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        client_max_body_size 10M;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/reportperjam /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx
```

### STEP 9: Firewall (UFW)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80
ufw allow 443
ufw enable
ufw status
```

Port 3000 **TIDAK di-allow** — hanya bisa diakses internal lewat nginx.

### STEP 10: Migrate & start app

```bash
cd /var/www/html/reportperjam

# Buat tabel + default admin user (idempotent, aman dijalankan lagi)
node --env-file=.env scripts/migrate-env-to-db.js

# Start dengan PM2
pm2 start ecosystem.config.cjs
pm2 save

# Auto-start setelah reboot
pm2 startup
# → Jalankan command sudo yang muncul. Setelah jalankan, ulangi `pm2 save`.

# Verify
pm2 status
pm2 logs tim-report-bot --lines 20 --nostream
```

Cek log harus muncul:
- `PostgreSQL initialized (multi-tenant SaaS)`
- `Database ready`
- `API server running on http://localhost:3000`
- `Multi-tenant scheduler started`
- `Ecosystem SaaS ready`

### STEP 11: Test akses

```bash
# Test direct IP — HARUS BLOCKED
curl -k https://213.163.201.225  # → connection refused / 444
```

Browser:
```
https://report.grup138.com
Login: admin / admin
```

### STEP 12: Setup brands

Lihat section [Operasi Harian — Add Brand](#add-brand-baru).

### STEP 13: Auto-start services lain

```bash
# PostgreSQL & Nginx biasanya sudah enabled by default, tapi cek:
systemctl is-enabled postgresql nginx pm2-root
# Ketiganya harus return "enabled"
```

---

## Operasi Harian

### Add Brand baru

1. Login admin panel → **Report Bot → Brands → + Add Brand**
2. Isi field umum:
   - **Key**: identifier unik (mis. `BRS11`, `P138`) — huruf besar tanpa spasi
   - **Name**: label tampilan (mis. `Beras 11`, `Panen 138`)
   - **Domain**: domain panel tanpa `https://` (mis. `joko77.spdinf.com`)
   - **Engine**: pilih `asia77` atau `syntech`
   - **Primary Color**: warna untuk header card di Telegram report
3. Isi field engine-specific:

   **Untuk asia77:**
   - **IDUS** (`user_id`): angka panjang dari panel — bisa dilihat di Network tab DevTools waktu fetch endpoint apapun
   - **Cookie Header**: paste setelah login manual via browser yang IP-nya whitelisted (lihat [Cookie management asia77](#cookie-management-asia77))

   **Untuk syntech:**
   - **Username**, **Password**, **PIN**: kredensial login panel
   - **API Key (X-Data-Reference)**: paste UUID dari header `x-data-reference` di request `/services/login` — capture sekali dari DevTools
   - **Login Hash**: paste field `hash` dari Payload tab request `/services/login`

4. Save → klik tombol **Test** untuk verifikasi koneksi → harus return `Test OK! TRX: N, REGIS: M`
5. Cron jam berikutnya akan otomatis fetch brand baru

### Cookie management (asia77)

Cookie panel asia77 expire kalau session idle. Session dijaga aktif oleh **2 mekanisme**: keepalive cron setiap 10 menit + pre-fetch refresh setiap jam di `:03`. Total 7 ping/jam — session dijamin hidup selama cookie valid. Kalau cookie di-revoke oleh panel (login dari device lain / admin panel reset), perlu re-paste.

**Cara login ulang dari host yang IP-nya tidak whitelisted (misal laptop lokal):**

Pakai SSH SOCKS tunnel ke VPS untuk pakai IP VPS sebagai proxy:

```bash
# Di terminal LOKAL (bukan VPS), biarkan terminal ini terbuka selama proses login
ssh -D 9090 -N -C root@213.163.201.225
```

Di browser:
1. Install extension **Zero Omega** / **SwitchyOmega** (Chrome/Edge)
2. Buat profile: SOCKS5, Server `localhost`, Port `9090`
3. Aktifkan profile → buka panel brand → login normal
4. Verifikasi tunnel jalan: buka `https://api.ipify.org` → harus tampil `213.163.201.225`
5. DevTools (F12) → Network → klik request → copy seluruh `Cookie` header
6. Admin panel → Brands → Edit → paste di field Cookie Header → Save
7. Klik Test → harus sukses
8. **Matikan profile Zero Omega kembali ke [Direct]** dan tutup terminal SSH

### Manual fetch / report trigger

Dari **Brands** page:
- **Test**: validate credentials, fetch sekarang, return TRX & REGIS (sync, langsung tampil)
- **Fetch**: trigger fetch async untuk brand ini saja
- **Send Report**: trigger send hourly report ke Telegram untuk brand ini

Dari **Hourly Report** page:
- **Backfill Data**: fill jam-jam yang kosong untuk tanggal yang dipilih (cuma asia77 & syntech yang punya endpoint per-jam, untuk syntech REGIS only)
- **Import CSV**: upload CSV manual (lihat [Import CSV](#import-csv))

### Import CSV

Untuk tanggal di mana panel sudah tidak punya datanya (cookie expired terlalu lama, panel down saat itu, dll), kamu bisa input data manual via CSV.

**Format CSV (long, 1 baris per data point):**

```csv
brand,date,hour,trx,regis
P138,2026-04-10,1,1500,80
P138,2026-04-10,2,2200,140
P138,2026-04-10,3,3000,
P138,2026-04-10,4,,180
P138,2026-04-10,5,0,0
P138,2026-04-10,24,12500,580
```

**Aturan kolom:**
- `brand` = brand key (case-sensitive, harus terdaftar di tenant kamu)
- `date` = `YYYY-MM-DD` (perhatian: bukan DD/MM/YYYY!)
- `hour` = 0-24, di mana 24 = FINISH (end-of-day)
- `trx` = angka ≥ 0, atau **kosong** = preserve TRX existing
- `regis` = angka ≥ 0, atau **kosong** = preserve REGIS existing
- Eksplisit `0` = di-overwrite jadi 0 (anggap data nyata)
- Cell **kedua-duanya kosong** = baris di-tolak (tidak ada update)
- Baris yang dimulai `#` = komentar, di-skip

**Cara pakai:**
1. Buka **Hourly Report → Import CSV** (button kanan atas)
2. Klik **Download Template CSV** untuk dapat file contoh
3. Edit di Excel/Notepad → save sebagai CSV
4. Pilih file di modal → preview otomatis muncul (5 baris pertama)
5. Cek counter `Valid` vs `Error` → fix kalau ada error → upload ulang
6. Klik **Import N baris** → confirm → tunggu sub-detik → success

**Tips Excel/Sheets**: format cell tanggal jadi **Plain Text** dulu sebelum ketik tanggal, atau ketik dengan apostrof prefix `'2026-04-10`. Kalau tidak, Excel auto-convert jadi serial number atau format lain.

### Add Referral Code

1. **Admin → Divisions** (superadmin only) → Add divisi baru kalau belum ada
2. Set `Telegram Group ID(s)` — bisa 1 atau lebih (newline-separated). Report fan-out ke semua group.
3. **Report Bot → Referrals → + Add**
4. Pilih brand, isi `Referral Code` (case-sensitive sesuai panel), pilih divisi, set Active

### Send referral report manual

Dari **Referrals** page, di setiap row ada 2 tombol:
- **Kirim** (hijau): fetch + render + send TG untuk 1 referral di tanggal yang di-set di section atas (default kemarin)
- **Backfill** (amber): isi snapshot range tanggal untuk 1 referral saja, **tanpa** kirim TG. Default range = awal bulan ini → kemarin

Untuk backfill bulk seluruh divisi (lebih berat), pakai form **Backfill Snapshot Referral** di atas.

---

## Fitur Detail

### Sidebar groups

| Group | Module | Akses |
|---|---|---|
| 🔵 REPORT BOT | `report` | Sesuai permission user |
| 🟢 KEUANGAN | `finance` | Sesuai permission user |
| 🟡 SISTEM GLOBAL | (admin only) | Hanya superadmin |

### Tabel hourly_snapshots

```sql
brand        TEXT       -- brand key
date         TEXT       -- YYYY-MM-DD
hour         INTEGER    -- 1-23 atau 24 (FINISH)
deposit_accepted_count INTEGER  -- TRX
regis_total  INTEGER    -- REGIS
tenant_id    INTEGER REFERENCES tenants(id)
created_at, updated_at TIMESTAMPTZ
UNIQUE(tenant_id, brand, date, hour)
```

### Helper upsert (tiga variant)

| Function | Behavior |
|---|---|
| `upsertSnapshot()` | Upsert dengan **fresh-data guard 55 menit** — kalau data baru di-update kurang dari 55 menit yang lalu, skip. Dipakai oleh cron auto-fetch supaya idempotent. |
| `upsertSnapshotNullable()` | Upsert tapi `trx` boleh null → ambil dari existing kalau ada. Dipakai oleh backfill. |
| `forceUpsertSnapshot()` | Selalu overwrite, no freshness check. Dipakai oleh CSV import (manual override). |

### Telegram report colors

Warna selisih (SELISIH/JAM dan SELISIH KMRN):
- **Hijau** (`#059669`) kalau positif (naik)
- **Merah** (`#dc2626`) kalau negatif (turun)
- Default text color kalau nol atau null

### Referral semantics

| Field DB | asia77 | syntech |
|---|---|---|
| `new_regis` | `newmb=true` (event-based, register di tanggal X) | `total_deposit=eq0` (snapshot saat ini, belum pernah deposit). Untuk hari ini = sama dengan event-based; untuk historis sedikit lag. |
| `depo_regis` | `nonnewmb=true` (existing member yang aktif tanggal X) | `total_deposit=gt0` (snapshot saat ini, sudah pernah deposit) |

**Persentase formula**: `depo / (new + depo)` (sama dengan formula spreadsheet operator `=B7/(B7+B6)`).

Untuk syntech daily cron 00:05 (fetch kemarin), lag 24 jam dari snapshot total_deposit cukup akurat. Untuk backfill jauh ke belakang, depo_regis mencerminkan state saat ini (bukan state saat tanggal target). Trade-off documented in code comments.

---

## Troubleshooting

### Service / app issues

| Gejala | Cek pertama | Fix |
|---|---|---|
| Website lambat / timeout | `pm2 status`, `pm2 logs` | Restart `pm2 restart tim-report-bot`. Kalau persisten cek section [Network issues](#network--ipv6-issues) di bawah. |
| `Cannot find module 'pg'` setelah git pull | Dependencies belum install | `cd /var/www/html/reportperjam && npm install && pm2 restart tim-report-bot` |
| Process keep restart | `pm2 logs tim-report-bot --err` | Lihat error stack. Biasanya: DB connection, port conflict, atau env variable hilang. |
| 502 Bad Gateway dari nginx | App belum jalan | `pm2 status` lalu restart pm2 |
| Puppeteer crash saat render | Path chromium salah | `which chromium-browser` → update `PUPPETEER_EXECUTABLE_PATH` di `.env` → `pm2 restart tim-report-bot --update-env` |

### Data issues

| Gejala | Penyebab biasa | Fix |
|---|---|---|
| Brand asia77 fail dengan "Cookie expired (ec=undefined)" | Session expired ATAU IP VPS tidak whitelisted | Re-paste cookie via SSH tunnel. Kalau persisten cek IPv6 (lihat section di bawah) |
| Brand syntech fail "Invalid API Key" | `auth_api_key` belum diset atau salah | Re-capture `x-data-reference` dari DevTools network tab login |
| Brand syntech fail "Invalid hash" | `auth_hash` belum diset atau salah | Re-capture `hash` dari Payload tab login |
| Hourly report tampil kosong padahal snapshot ada | Tenant ID mismatch | Cek `pg_stat_activity` & `report_brands.tenant_id` |
| Persentase tampil aneh di referral dashboard | Formula expectation beda | Formula sekarang `depo / (new + depo)`, bukan `depo / new`. Match spreadsheet operator. |
| Telegram return `PHOTO_INVALID_DIMENSIONS` | Image referral terlalu tinggi (ratio > 20:1 atau w+h > 10000) | Sudah ada auto-fallback ke `sendDocument` di [tim-sender.js](src/tim/tim-sender.js). Lihat log untuk konfirmasi fallback berfungsi. |

### Network / IPv6 issues

**Gejala paling sering**: keepalive timeout di semua brand serempak, website admin terasa lambat, tapi `ping 1.1.1.1` jalan normal dan VPS resource sehat (load ~0, RAM cukup).

**Akar masalah**: VPS dual-stack IPv4+IPv6, tapi IPv6 routing rusak (umum di Singapore region). Node.js `got-scraping` happy-eyeballs prefer IPv6 → connection hang sampai timeout 30 detik per request → cascade timeout di semua brand.

Lihat section [IPv6 Permanen Fix](#ipv6-permanen-fix-sangat-penting) di bawah.

### Diagnostic command quick reference

```bash
# Status overall
pm2 status
free -h && df -h /

# App log realtime
pm2 logs tim-report-bot --lines 50

# Hanya error
pm2 logs tim-report-bot --lines 100 --err

# Cron / scheduler aktif?
pm2 logs tim-report-bot --lines 30 --nostream | grep -iE 'scheduler|started'

# Cek snapshot terbaru
sudo -u postgres psql -d reportbot -c "
SELECT brand, date, hour, deposit_accepted_count, regis_total, updated_at
FROM hourly_snapshots
WHERE date = CURRENT_DATE
ORDER BY brand, hour DESC LIMIT 20;
"

# Cek tenant
sudo -u postgres psql -d reportbot -c "SELECT id, name, slug, is_active FROM tenants;"

# Cek connection ke panel via curl (force IPv4)
curl -4 -v --max-time 10 https://asia77cash.com/clearMessage 2>&1 | tail -15

# Cek IPv6 status
sysctl net.ipv6.conf.all.disable_ipv6
ip a | grep inet6

# Cek panel via DNS
getent hosts asia77cash.com
dig AAAA asia77cash.com +short
```

---

## IPv6 Permanen Fix (SANGAT PENTING)

> Tanpa fix ini, fetch ke panel akan hang random sampai timeout 30 detik dan website admin terasa lambat. Sudah dikonfirmasi terjadi di multiple Singapore VPS provider.

Lakukan **3-layer fix** supaya benar-benar permanen — bahkan kalau ada `apt upgrade` atau cloud-init reset.

### Layer 1: sysctl.d (persistent, apply tanpa reboot)

```bash
# Bersihkan kalau pernah ada di sysctl.conf
sudo sed -i '/disable_ipv6/d' /etc/sysctl.conf

# Buat file dedicated
sudo tee /etc/sysctl.d/99-disable-ipv6.conf > /dev/null <<'EOF'
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
net.ipv6.conf.lo.disable_ipv6 = 1
EOF

sudo sysctl --system

# Verifikasi
sysctl net.ipv6.conf.all.disable_ipv6
# Harus return: net.ipv6.conf.all.disable_ipv6 = 1
```

### Layer 2: GRUB kernel parameter (paling robust, butuh reboot)

```bash
# Backup dulu
sudo cp /etc/default/grub /etc/default/grub.bak-$(date +%s)

# Tambah ipv6.disable=1 ke GRUB_CMDLINE_LINUX_DEFAULT
sudo sed -i 's|^GRUB_CMDLINE_LINUX_DEFAULT="\(.*\)"|GRUB_CMDLINE_LINUX_DEFAULT="\1 ipv6.disable=1"|' /etc/default/grub

# Verifikasi
grep GRUB_CMDLINE_LINUX_DEFAULT /etc/default/grub
# Harus mengandung "ipv6.disable=1"

# Update GRUB config
sudo update-grub

# Reboot
sudo reboot
```

Tunggu ~30-60 detik, SSH masuk lagi, verifikasi:

```bash
# Kernel cmdline harus mengandung ipv6.disable=1
cat /proc/cmdline

# Tidak ada lagi inet6 (kecuali mungkin link-local fe80 dari netfilter sisa, harmless)
ip a | grep inet6

# Modul ipv6 utama tidak load (nf_reject_ipv6/nf_defrag_ipv6 mungkin tetap ada dari iptables, harmless)
lsmod | grep ipv6
```

### Layer 3: PostgreSQL pool timezone (defense in depth, opsional kalau pakai pg)

Sudah otomatis dari `src/storage/postgres.js` — tidak perlu manual setup. Tapi penting untuk diketahui: postgres pool sekarang pakai `options: '-c timezone=Asia/Phnom_Penh'` di startup parameter (libpq), bukan `client.query("SET timezone")` di event listener (yang menyebabkan `DeprecationWarning: Calling client.query() when client is already executing a query`).

### Verifikasi fix bekerja

```bash
# 1. curl force IPv4 — harus jalan normal
curl -4 -v --max-time 10 https://asia77cash.com/clearMessage 2>&1 | tail -10

# 2. curl force IPv6 — harus fail/timeout
curl -6 --max-time 5 https://asia77cash.com/ 2>&1 | tail -5

# 3. Cek log keepalive setelah ~10 menit
pm2 logs tim-report-bot --lines 50 --nostream | grep -iE 'keepalive'
# Tidak boleh ada baris baru "Keepalive failed" dari PID sekarang
```

---

## Update / Deploy Workflow

Workflow standar setiap kali ada commit baru di GitHub:

```bash
# 1. SSH ke VPS
ssh root@213.163.201.225
cd /var/www/html/reportperjam

# 2. Pull
git pull

# 3. Kalau ada perubahan di backend dependencies
npm install

# 4. Kalau ada perubahan di admin/* (frontend), rebuild
cd admin && npm run build && cd ..

# 5. Restart PM2
pm2 restart tim-report-bot --update-env

# 6. Verifikasi
pm2 logs tim-report-bot --lines 20 --nostream | grep -iE 'started|error'
```

**Aturan emas pm2:** setiap kali kamu start/stop/restart proses baru di pm2, jalankan `pm2 save` setelahnya. Kalau tidak, perubahan tidak akan ikut waktu reboot berikutnya.

**Browser cache:** kalau perubahan ada di frontend dan kamu sudah `npm run build`, **hard refresh browser dengan Ctrl+Shift+R** (bukan F5) supaya bundle JS lama tidak di-cache.

---

## Struktur Kode

```
reportperjam/
├── README.md                       ← Dokumen ini (single source of truth)
├── package.json                    ← Backend deps
├── ecosystem.config.cjs            ← PM2 config
├── nginx.conf                      ← Nginx reference (di-deploy ke /etc/nginx/sites-available/)
├── .env                            ← Local env (gitignored)
│
├── src/                            ← Backend (Fastify + Node)
│   ├── server.js                   ← Entry point: register routes, start scheduler
│   ├── scheduler.js                ← Cron jobs (multi-tenant loop)
│   ├── logger.js                   ← Pino logger setup
│   │
│   ├── api/                        ← Engine adapters per panel
│   │   ├── asia77-engine.js        ← Cookie + got-scraping
│   │   ├── syntech-engine.js       ← JWT + per-domain token cache
│   │   └── fetch-brand.js          ← Engine dispatcher (hourly + FINISH)
│   │
│   ├── tim/                        ← Tim Report (hourly Telegram report)
│   │   ├── tim-orchestrator.js     ← Loop brand, render, send
│   │   ├── tim-data.js             ← Query snapshot + compute kolom
│   │   ├── tim-html.js             ← Generate HTML untuk Puppeteer
│   │   ├── tim-renderer.js         ← Puppeteer screenshot → PNG buffer
│   │   ├── tim-sender.js           ← Telegram sendPhoto + auto-fallback sendDocument
│   │   ├── tim-alert.js            ← Alert error ke Telegram
│   │   ├── brand-configs.js        ← Decrypt + map brand DB → runtime object
│   │   ├── referral-report-orchestrator.js  ← Daily referral cycle + per-row trigger
│   │   └── referral-report-html.js          ← HTML render per referral card
│   │
│   ├── routes/                     ← Fastify route handlers
│   │   ├── auth.js                 ← Login, /me, password reset
│   │   ├── brands.js               ← Brand CRUD + Test endpoint
│   │   ├── referrals.js            ← Referral CRUD + Dashboard query
│   │   ├── reports.js              ← Hourly report + chart data
│   │   ├── monitoring.js           ← Status, logs
│   │   ├── actions.js              ← Manual triggers: fetch, send, backfill, import CSV
│   │   ├── settings.js             ← Module-scoped settings
│   │   ├── users.js                ← User + division management
│   │   ├── signup.js               ← Public tenant signup
│   │   ├── home.js                 ← Combined dashboard data
│   │   └── finance/                ← Modul Keuangan (terpisah, optional)
│   │
│   ├── storage/                    ← Database access layer
│   │   ├── postgres.js             ← Pool init, schema migrations, upsert helpers
│   │   ├── brand-store.js          ← report_brands CRUD
│   │   ├── referral-store.js       ← referral_codes + snapshots
│   │   ├── settings-store.js       ← Module-scoped settings
│   │   ├── log-store.js            ← job_logs (insert, query, monthly cleanup)
│   │   └── audit-store.js          ← audit_logs
│   │
│   ├── middleware/
│   │   ├── auth.js                 ← JWT verify + permissions
│   │   ├── tenant.js               ← Resolve tenant from subdomain/host
│   │   └── tenant-scope.js         ← Helper untuk tWhere() di SQL
│   │
│   └── utils/
│       ├── auth-utils.js           ← bcrypt password hashing
│       ├── crypto.js               ← AES encryption untuk credentials
│       ├── datetime.js             ← Timezone-aware (Asia/Phnom_Penh)
│       └── division-filter.js
│
├── admin/                          ← Frontend (React + Vite)
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── dist/                       ← Build output, di-serve oleh nginx
│   └── src/
│       ├── App.jsx                 ← Routes
│       ├── main.jsx                ← Entry point
│       ├── api/client.js           ← Wrapper fetch ke backend
│       ├── hooks/
│       │   ├── useAuth.jsx         ← Auth context
│       │   └── useDarkMode.jsx
│       ├── components/
│       │   ├── Layout.jsx          ← Sidebar + outlet (sidebar groups defined here)
│       │   ├── Breadcrumb.jsx
│       │   └── CrudTable.jsx       ← Reusable CRUD table
│       └── pages/
│           ├── Login.jsx, Signup.jsx, Home.jsx
│           ├── report/             ← Modul Report Bot
│           │   ├── Dashboard.jsx, BrandList.jsx, BrandForm.jsx
│           │   ├── ReportView.jsx              ← Hourly Report + Import CSV
│           │   ├── ReportHistory.jsx, Comparison.jsx
│           │   ├── Referrals.jsx               ← Referrals page (Kirim/Backfill per row)
│           │   ├── ReferralsDashboard.jsx      ← Excel-style monthly breakdown + search
│           │   ├── ReferralLogs.jsx, Logs.jsx, Settings.jsx
│           ├── finance/            ← Modul Keuangan (terpisah)
│           └── admin/              ← Sistem Global (Users, Divisions)
│
└── scripts/                        ← One-shot scripts
    ├── migrate-env-to-db.js        ← Initial seed: tabel + admin user + tenant default
    ├── login-brand.js              ← Puppeteer headed browser untuk login asia77
    └── (utility scripts lain)
```

---

## Catatan Penting

- **Timezone**: semua pakai `Asia/Phnom_Penh` (UTC+7 = WIB). Jangan campur timezone lain di datetime calculation, gunakan helper `src/utils/datetime.js`.
- **Logger**: pakai `logger` dari pino, jangan `console.log`. Output bisa dilihat dengan `pm2 logs`.
- **Engine isolation**: jangan import `asia77-engine.js` dari `syntech-engine.js` atau sebaliknya. Semua dispatch lewat `brand.engine` di 5 lokasi dispatcher.
- **Tenant scope**: setiap query DB di route handler **wajib** thread `tenant_id` dari `request.tenantId`. Helper `tWhere()` ada di [src/middleware/tenant-scope.js](src/middleware/tenant-scope.js).
- **Encryption**: field credential sensitive (`auth_pass`, `auth_pin`, `auth_api_key`, `auth_hash`) di-encrypt at rest pakai AES via [src/utils/crypto.js](src/utils/crypto.js). Saat read, decrypt di [brand-configs.js](src/tim/brand-configs.js). Saat update via API, mask nilai di GET response (return `********`) supaya tidak bocor ke frontend.
- **Browser cache**: hard refresh pakai Ctrl+Shift+R setiap deploy admin, F5 biasa tidak cukup karena Vite hash-based caching.
- **Backup**: PostgreSQL pakai `pg_dump` schedule harian:
  ```bash
  pg_dump -U postgres reportbot > /backup/reportbot-$(date +%Y%m%d).sql
  ```

---

## Lisensi & Author

Internal project. Maintained by [@official-panen138](https://github.com/official-panen138). Built with help from Claude (Anthropic).
