# Tim Hourly Report Bot

Bot Telegram untuk mengirim laporan indeks transaksi (TRX) dan registrasi (REGIS) per jam secara otomatis.

## Fitur

- Report setiap jam sebagai foto PNG ke grup Telegram
- 24 baris data: First Hour s/d Finish
- Perbandingan hari ini vs kemarin (KMRN, /JAM, SISA)
- Scoreboard, Trend Bar, Proyeksi akhir hari
- Per brand dengan warna dan logo masing-masing
- Retry otomatis jika gagal fetch/kirim
- Fresh-data guard mencegah data ditimpa

## Dua Engine yang Didukung

### Engine A: Asia77 (Cookie-based)
Untuk panel yang dilindungi **Cloudflare**. Menggunakan `got-scraping` yang meniru TLS fingerprint Chrome + session cookie.

**Cara kerja auth:**
1. Login manual via browser (sekali saja)
2. Extract cookie dari Chrome via CDP → simpan ke `data/cookies.json`
3. Keepalive service hit `/clearMessage` setiap 15 menit → session tetap hidup
4. Bot fetch API pakai cookie dari file → Cloudflare izinkan

**API yang dipakai:**
- `POST /daily/info/list {isNew:false}` → `dpapp` = approved deposit count
- `POST /memberlist` (pagination) → total registrasi hari ini

### Engine B: Syntech/WIS (JWT-based)
Untuk panel yang pakai **JWT token**. Tidak perlu browser.

**Cara kerja auth:**
1. `POST /services/login` → dapat JWT token
2. `POST /services/pin/validate` → unlock menu
3. Pakai token di header `Authorization: Bearer <token>`
4. Auto re-auth jika token expired (401)

**API yang dipakai:**
- `GET /services/transactions/summary` → `deposit_action_accepted_count`
- `GET /services/players` → `meta.total` = registrasi

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy dan edit environment
cp .env.example .env
# Edit .env — isi token bot, group ID, domain brand, credentials

# 3. Siapkan cookies (untuk Engine A — Asia77)
# Login di Chrome, extract cookies, simpan ke data/cookies.json

# 4. Jalankan
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # auto-start setelah reboot
```

## Struktur Folder

```
├── src/
│   ├── api/
│   │   ├── asia77-engine.js    ← Engine A: cookie + got-scraping
│   │   ├── syntech-engine.js   ← Engine B: JWT authentication
│   │   └── fetch-brand.js      ← Unified: route ke engine yang benar
│   ├── storage/
│   │   └── sqlite.js           ← Database (hourly_snapshots)
│   ├── tim/
│   │   ├── brand-configs.js    ← Konfigurasi brand (warna, logo, domain)
│   │   ├── tim-data.js         ← Query + hitung kolom
│   │   ├── tim-html.js         ← Generate HTML report
│   │   ├── tim-renderer.js     ← Puppeteer screenshot → PNG
│   │   ├── tim-sender.js       ← Kirim foto ke Telegram
│   │   └── tim-orchestrator.js ← Koordinasi semua brand
│   ├── utils/
│   │   └── datetime.js         ← Timezone-aware date utility
│   ├── logger.js               ← pino logger
│   └── index.js                ← Entry point + cron schedule
├── data/                       ← SQLite DB + cookies
├── assets/logos/                ← Logo brand (PNG)
├── .env.example                ← Template environment
├── ecosystem.config.cjs        ← PM2 config
└── package.json
```

## Jadwal Cron

| Waktu | Aksi |
|-------|------|
| `:00` (jam 1-23) | Fetch data dari panel API → simpan SQLite |
| `:05` (jam 1-23) | Baca SQLite → render HTML → screenshot → kirim Telegram |
| `00:05` | Fetch FINISH (yd*) → simpan hour=24 → kirim report FINISH |

## Definisi Data

| Field | Sumber | Keterangan |
|-------|--------|------------|
| TRX | `dpapp` (Asia77) / `deposit_action_accepted_count` (Syntech) | Hanya deposit yang approved |
| REGIS | `/memberlist` count (Asia77) / `/services/players` total (Syntech) | Total registrasi hari itu |
| FINISH | `yddpapp` (Asia77) / fetch with yesterday date (Syntech) | Total hari penuh |

## Kolom Report

| Kolom | Kalkulasi |
|-------|-----------|
| KMRN | Kumulatif kemarin di jam yang sama |
| HARI INI | Kumulatif hari ini di jam ini |
| /JAM | HARI_INI[jam_ini] - HARI_INI[jam_sebelum] |
| SISA | HARI_INI[jam_ini] - KMRN[jam_ini] |

## Tambah Brand Baru

1. Edit `.env` — tambah env vars untuk brand baru
2. Edit `src/tim/brand-configs.js` — tambah entry baru di array BRANDS
3. Taruh logo di `assets/logos/`
4. Untuk Engine A: tambah entry di `data/cookies.json`
5. Restart: `pm2 restart tim-report-bot`

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Cloudflare block | Pastikan pakai `got-scraping`, bukan axios/fetch biasa |
| Session expired | Cek keepalive service jalan. Login ulang + extract cookies |
| Report tidak terkirim | `pm2 logs tim-report-bot` — cek error terakhir |
| Data salah/inflated | Cek fresh-data guard (55 menit). Pastikan hanya fetch di :00 |
| PC sleep | macOS: `sudo pmset -a sleep 0`. Windows: Power Settings → Never |

## Catatan Penting

- **Timezone:** sesuaikan di `.env`, `cron.schedule()`, dan `DateTime` utility
- **Jangan console.log** — pakai pino logger
- **Backup SQLite** — schedule `cp data/report.db ~/backups/` harian
- **Fresh-data guard 55 menit** — data :00 tidak ditimpa sampai jam berikutnya
- **Error 1 brand tidak stop brand lain** — setiap brand di-wrap try/catch
