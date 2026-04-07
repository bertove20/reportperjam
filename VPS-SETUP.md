# VPS Setup Guide — Report Bot SaaS
## Domain: report.grup138.com → VPS via Cloudflare

---

## STEP 1: Cloudflare DNS

Login ke Cloudflare → pilih domain `grup138.com` → DNS → Add Record:

```
Type: A
Name: report
Content: 213.163.201.225
Proxy status: Proxied (orange cloud ON)
TTL: Auto
```

Cloudflare → SSL/TLS → Overview → Mode: **Full**
Cloudflare → SSL/TLS → Origin Server → **Authenticated Origin Pulls: ON**

---

## STEP 2: SSH ke VPS

```bash
ssh root@213.163.201.225
```

---

## STEP 3: Install Dependencies

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Verify
node --version  # v22.x
npm --version

# Install Nginx
apt install -y nginx

# Install Puppeteer/Chromium dependencies
apt install -y chromium-browser fonts-liberation libappindicator3-1 \
  libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libcups2t64 \
  libdbus-1-3 libdrm2 libgbm1 libgtk-3-0t64 libnspr4 libnss3 \
  libxcomposite1 libxdamage1 libxrandr2 xdg-utils ca-certificates \
  fonts-freefont-ttf git build-essential

# Jika chromium-browser tidak tersedia, coba:
# apt install -y chromium

# Cek path chromium
which chromium-browser || which chromium
# Catat path ini untuk .env nanti

# Install PM2
npm install -g pm2
```

---

## STEP 4: Clone & Setup Project

```bash
cd /opt
git clone https://github.com/official-panen138/reportperjam.git
cd /opt/reportperjam

# Install backend dependencies
npm install

# Install & build frontend
cd admin && npm install && npm run build && cd ..

# Buat folder
mkdir -p data logs assets/logos
```

---

## STEP 5: Buat .env

```bash
# Generate random keys
ENCRYPTION_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo "JWT_SECRET=$JWT_SECRET"
```

```bash
# Buat .env file
cat > /opt/reportperjam/.env << ENVEOF
# ============================================
# Tim Hourly Report Bot — VPS Config
# ============================================

# Telegram Bot
TG_BOT_TOKEN=8663808582:AAGmg1FALVan1s7AQK9VPsPPxzaAVyit7LY
TG_REPORT_GROUP=-4993466682

# Timezone
TZ=Asia/Phnom_Penh

# Server
PORT=3000
ENCRYPTION_KEY=$ENCRYPTION_KEY
JWT_SECRET=$JWT_SECRET

# Puppeteer — pakai system chromium (SESUAIKAN path dari step 3)
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENVEOF
```

Verifikasi:
```bash
cat /opt/reportperjam/.env
```

---

## STEP 6: Nginx + Cloudflare Authenticated Origin Pull

### Download Cloudflare Origin Pull CA

```bash
curl -o /etc/nginx/cf-origin-pull.pem \
  https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem
```

### Generate Cloudflare Origin Certificate

1. Cloudflare → SSL/TLS → Origin Server → **Create Certificate**
2. Pilih: Generate private key and CSR with Cloudflare
3. Hostnames: `report.grup138.com`
4. Validity: 15 years
5. Create → **Copy** Origin Certificate dan Private Key

```bash
# Paste Origin Certificate
cat > /etc/nginx/cf-origin-cert.pem << 'CERTEOF'
-----BEGIN CERTIFICATE-----
PASTE_CERTIFICATE_DARI_CLOUDFLARE_DISINI
-----END CERTIFICATE-----
CERTEOF

# Paste Private Key
cat > /etc/nginx/cf-origin-key.pem << 'KEYEOF'
-----BEGIN PRIVATE KEY-----
PASTE_PRIVATE_KEY_DARI_CLOUDFLARE_DISINI
-----END PRIVATE KEY-----
KEYEOF

# Amankan key
chmod 600 /etc/nginx/cf-origin-key.pem
```

### Buat Nginx Config

```bash
cat > /etc/nginx/sites-available/reportperjam << 'NGINXEOF'
# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name report.grup138.com;
    return 301 https://$host$request_uri;
}

# Block direct IP access (HTTP)
server {
    listen 80 default_server;
    server_name _;
    return 444;
}

# Block direct IP access (HTTPS)
server {
    listen 443 ssl default_server;
    server_name _;
    ssl_certificate /etc/nginx/cf-origin-cert.pem;
    ssl_certificate_key /etc/nginx/cf-origin-key.pem;
    return 444;
}

# Main server — hanya Cloudflare yang bisa akses
server {
    listen 443 ssl;
    server_name report.grup138.com;

    # Cloudflare Origin Certificate
    ssl_certificate /etc/nginx/cf-origin-cert.pem;
    ssl_certificate_key /etc/nginx/cf-origin-key.pem;

    # Authenticated Origin Pull — HANYA Cloudflare yang boleh connect
    ssl_client_certificate /etc/nginx/cf-origin-pull.pem;
    ssl_verify_client on;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Proxy ke app
    location / {
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

        # Upload size (untuk logo brand)
        client_max_body_size 10M;
    }
}
NGINXEOF
```

### Enable & Test

```bash
# Enable site, disable default
ln -sf /etc/nginx/sites-available/reportperjam /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test config
nginx -t

# Restart
systemctl restart nginx
systemctl enable nginx
```

---

## STEP 7: Firewall

```bash
# Reset firewall
ufw reset

# Default policy
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (PENTING — jangan sampai ke-lock)
ufw allow ssh

# Allow HTTP/HTTPS (Nginx handle siapa yang boleh)
ufw allow 80
ufw allow 443

# Enable
ufw enable

# Verify
ufw status
```

Port 3000 **TIDAK di-allow** — hanya bisa diakses internal (Nginx).

---

## STEP 8: Migrate & Start App

```bash
cd /opt/reportperjam

# Migrate: buat tabel + default admin user
node --env-file=.env scripts/migrate-env-to-db.js

# Start dengan PM2
pm2 start ecosystem.config.cjs
pm2 save

# Auto-start setelah reboot
pm2 startup
# → Jalankan command sudo yang diminta oleh PM2

# Verify
pm2 status
pm2 logs tim-report-bot --lines 20
```

---

## STEP 9: Test

### Test dari browser:
```
https://report.grup138.com
Login: admin / admin
```

### Test direct IP (harus BLOCKED):
```
http://213.163.201.225     → Connection refused / timeout
https://213.163.201.225    → Connection refused / timeout
```

### Test dari VPS:
```bash
# Harus work (internal)
curl http://127.0.0.1:3000/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

---

## STEP 10: Setup Brands

Buka https://report.grup138.com → Login → Brands:

1. **Add Brand** → isi Key, Name, Domain, Engine, IDUS
2. **Paste Cookie** → dari DevTools browser kamu (bukan dari VPS)
3. **Test** → verifikasi fetch berhasil
4. **Repeat** untuk semua brand

### Cara copy cookie:
1. Login ke panel brand di browser PC kamu
2. DevTools (F12) → Network → klik request → Headers → Cookie
3. Copy seluruh value
4. Paste di admin panel → Edit Brand → Cookie Header

---

## Maintenance

### Update code
```bash
cd /opt/reportperjam
git pull origin main
cd admin && npm run build && cd ..
pm2 restart tim-report-bot
```

### Lihat logs
```bash
pm2 logs tim-report-bot --lines 50
```

### Restart
```bash
pm2 restart tim-report-bot
```

### Backup database
```bash
cp /opt/reportperjam/data/report.db /opt/reportperjam/data/report-backup-$(date +%Y%m%d).db
```

---

## Troubleshooting

### Nginx error: "ssl_client_certificate not found"
```bash
# Pastikan file ada
ls -la /etc/nginx/cf-origin-pull.pem
ls -la /etc/nginx/cf-origin-cert.pem
ls -la /etc/nginx/cf-origin-key.pem
```

### 502 Bad Gateway
```bash
# App belum jalan
pm2 status
pm2 restart tim-report-bot
```

### Puppeteer crash
```bash
# Cek chromium path
which chromium-browser || which chromium

# Update .env jika path berbeda
nano /opt/reportperjam/.env
# Sesuaikan PUPPETEER_EXECUTABLE_PATH

pm2 restart tim-report-bot
```

### Cookie expired terus / ec=undefined / IP not whitelisted
Bot sudah ada keepalive setiap 15 menit. Jika masih expired:
- Cek apakah IP VPS di-block oleh Cloudflare panel
- Coba login ulang via admin panel

### VPS terblokir panel (IPv6 not whitelisted)
Gejala: semua brand error "Cookie expired (ec=undefined)", padahal cookie baru di-paste.
Penyebab: VPS punya dual-stack IPv4+IPv6, panel asia77 hanya whitelist IPv4.

```bash
# Cek status IPv6
cat /proc/sys/net/ipv6/conf/all/disable_ipv6
# Output 0 = IPv6 masih aktif (masalah!)

# Fix: disable IPv6
sysctl -w net.ipv6.conf.all.disable_ipv6=1
sysctl -w net.ipv6.conf.default.disable_ipv6=1

# Permanen (survive reboot)
echo "net.ipv6.conf.all.disable_ipv6=1" >> /etc/sysctl.conf
echo "net.ipv6.conf.default.disable_ipv6=1" >> /etc/sysctl.conf
sysctl -p

# Verifikasi pakai IPv4
curl -4 -sI https://asia77cash.com | head -5

# Restart bot
pm2 restart tim-report-bot --update-env
```

### Login ke panel brand via SSH SOCKS tunnel (Zero Omega)
Kalau panel blok IP lokal/kantor, pakai VPS sebagai proxy:

```bash
# Di terminal LOKAL Windows (bukan VPS!) — biarkan terbuka
ssh -D 9090 -N -C root@213.163.201.225
```

Di browser:
1. Install extension **Zero Omega** (Chrome/Edge)
2. Buat profile: SOCKS5, Server: `localhost`, Port: `9090`
3. Aktifkan profile → buka panel brand → login
4. DevTools (F12) → Network → copy Cookie
5. Admin panel → Brands → Edit → paste cookie → Save
6. Selesai → matikan profile Zero Omega kembali ke [Direct]

Verifikasi tunnel jalan: buka https://api.ipify.org → harus menunjukkan `213.163.201.225`
