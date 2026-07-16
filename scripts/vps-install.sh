#!/bin/bash
# ══════════════════════════════════════════════════════════
# VPS AUTO INSTALLER — Report Bot SaaS
# Domain: report.grup138.com
#
# Jalankan di VPS:
#   curl -sL https://raw.githubusercontent.com/bertove20/reportperjam/main/scripts/vps-install.sh | bash
#
# Atau jika sudah clone:
#   bash scripts/vps-install.sh
# ══════════════════════════════════════════════════════════

set -e
DOMAIN="report.grup138.com"
APP_DIR="/opt/reportperjam"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}"
echo "══════════════════════════════════════════"
echo "  Report Bot SaaS — VPS Installer"
echo "  Domain: $DOMAIN"
echo "══════════════════════════════════════════"
echo -e "${NC}"

# ─── STEP 1: System Update ───
echo -e "${YELLOW}[1/8] Updating system...${NC}"
apt update && apt upgrade -y

# ─── STEP 2: Install PostgreSQL ───
echo -e "${YELLOW}[2/9] Installing PostgreSQL...${NC}"
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

# Create database and user
sudo -u postgres psql -c "CREATE DATABASE reportbot;" 2>/dev/null || echo "  DB already exists"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'reportbot123';" 2>/dev/null
echo -e "${GREEN}  PostgreSQL ready${NC}"

# ─── STEP 3: Install Node.js 22 ───
echo -e "${YELLOW}[3/9] Installing Node.js 22...${NC}"
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
fi
echo -e "${GREEN}  Node.js $(node -v)${NC}"

# ─── STEP 3: Install Nginx ───
echo -e "${YELLOW}[3/8] Installing Nginx...${NC}"
apt install -y nginx
systemctl enable nginx

# ─── STEP 4: Install Chromium + dependencies ───
echo -e "${YELLOW}[4/8] Installing Chromium & dependencies...${NC}"
apt install -y git build-essential ca-certificates fonts-freefont-ttf \
  fonts-liberation xdg-utils \
  libappindicator3-1 || true
# Coba install chromium (nama package beda per distro)
apt install -y chromium-browser 2>/dev/null || apt install -y chromium 2>/dev/null || true

# Cari path chromium
CHROMIUM_PATH=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo "")
if [ -z "$CHROMIUM_PATH" ]; then
  echo -e "${RED}  WARNING: Chromium tidak ditemukan, Puppeteer akan download sendiri${NC}"
  CHROMIUM_PATH=""
else
  echo -e "${GREEN}  Chromium: $CHROMIUM_PATH${NC}"
fi

# ─── STEP 5: Install PM2 ───
echo -e "${YELLOW}[5/8] Installing PM2...${NC}"
npm install -g pm2

# ─── STEP 6: Clone & Setup Project ───
echo -e "${YELLOW}[6/8] Setting up project...${NC}"
if [ -d "$APP_DIR" ]; then
  echo "  Project sudah ada, pulling latest..."
  cd $APP_DIR
  git pull origin main
else
  cd /opt
  git clone https://github.com/bertove20/reportperjam.git
  cd $APP_DIR
fi

# Install dependencies
echo "  Installing backend dependencies..."
npm install

echo "  Installing & building frontend..."
cd admin && npm install && npm run build && cd ..

# Buat folder
mkdir -p data logs assets/logos

# ─── STEP 7: Generate .env ───
echo -e "${YELLOW}[7/8] Creating .env...${NC}"
if [ -f "$APP_DIR/.env" ]; then
  echo -e "  ${YELLOW}.env sudah ada, SKIP (edit manual jika perlu)${NC}"
else
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  JWT_SECRET=$(openssl rand -hex 32)

  cat > $APP_DIR/.env << ENVEOF
# ============================================
# Tim Hourly Report Bot — VPS Config
# ============================================

# Telegram Bot
TG_BOT_TOKEN=GANTI_DENGAN_BOT_TOKEN
TG_REPORT_GROUP=GANTI_DENGAN_GROUP_ID

# Timezone
TZ=Asia/Phnom_Penh

# Server
PORT=3000
ENCRYPTION_KEY=$ENCRYPTION_KEY
JWT_SECRET=$JWT_SECRET

# Puppeteer
# PostgreSQL
DATABASE_URL=postgresql://postgres:reportbot123@localhost:5432/reportbot

# Puppeteer
PUPPETEER_EXECUTABLE_PATH=$CHROMIUM_PATH
ENVEOF

  echo -e "  ${GREEN}.env created${NC}"
  echo -e "  ${RED}PENTING: Edit .env dan isi TG_BOT_TOKEN + TG_REPORT_GROUP!${NC}"
  echo -e "  Jalankan: ${YELLOW}nano $APP_DIR/.env${NC}"
fi

# ─── STEP 8: Setup Nginx ───
echo -e "${YELLOW}[8/8] Setting up Nginx...${NC}"

# Download Cloudflare Origin Pull CA
curl -so /etc/nginx/cf-origin-pull.pem \
  https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem

# Cek apakah SSL cert sudah ada
if [ ! -f /etc/nginx/cf-origin-cert.pem ]; then
  echo ""
  echo -e "${RED}══════════════════════════════════════════${NC}"
  echo -e "${RED}  SSL CERTIFICATE BELUM ADA!${NC}"
  echo -e "${RED}══════════════════════════════════════════${NC}"
  echo ""
  echo "  Kamu perlu buat Origin Certificate di Cloudflare:"
  echo ""
  echo "  1. Login Cloudflare → SSL/TLS → Origin Server"
  echo "  2. Create Certificate"
  echo "  3. Hostnames: $DOMAIN"
  echo "  4. Validity: 15 years → Create"
  echo "  5. Copy Certificate dan Private Key"
  echo ""
  echo "  Lalu paste di VPS:"
  echo ""
  echo -e "  ${YELLOW}nano /etc/nginx/cf-origin-cert.pem${NC}"
  echo "  → Paste Origin Certificate"
  echo ""
  echo -e "  ${YELLOW}nano /etc/nginx/cf-origin-key.pem${NC}"
  echo "  → Paste Private Key"
  echo ""
  echo -e "  ${YELLOW}chmod 600 /etc/nginx/cf-origin-key.pem${NC}"
  echo ""
  echo "  Setelah itu jalankan:"
  echo -e "  ${YELLOW}bash $APP_DIR/scripts/vps-finish.sh${NC}"
  echo ""

  # Buat script finish
  cat > $APP_DIR/scripts/vps-finish.sh << 'FINISHEOF'
#!/bin/bash
set -e
DOMAIN="report.grup138.com"
APP_DIR="/opt/reportperjam"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Finishing VPS setup...${NC}"

# Verify SSL files
if [ ! -f /etc/nginx/cf-origin-cert.pem ] || [ ! -f /etc/nginx/cf-origin-key.pem ]; then
  echo "ERROR: SSL certificate files not found!"
  echo "  /etc/nginx/cf-origin-cert.pem"
  echo "  /etc/nginx/cf-origin-key.pem"
  exit 1
fi

# Nginx config
cat > /etc/nginx/sites-available/reportperjam << 'NGINXEOF'
# Block direct IP (HTTP)
server {
    listen 80 default_server;
    server_name _;
    return 444;
}

# Redirect domain HTTP → HTTPS
server {
    listen 80;
    server_name report.grup138.com;
    return 301 https://$host$request_uri;
}

# Block direct IP (HTTPS)
server {
    listen 443 ssl default_server;
    server_name _;
    ssl_certificate /etc/nginx/cf-origin-cert.pem;
    ssl_certificate_key /etc/nginx/cf-origin-key.pem;
    return 444;
}

# Main — hanya Cloudflare
server {
    listen 443 ssl;
    server_name report.grup138.com;

    ssl_certificate /etc/nginx/cf-origin-cert.pem;
    ssl_certificate_key /etc/nginx/cf-origin-key.pem;

    # Authenticated Origin Pull — HANYA Cloudflare
    ssl_client_certificate /etc/nginx/cf-origin-pull.pem;
    ssl_verify_client on;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

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
        client_max_body_size 10M;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/reportperjam /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl restart nginx
echo -e "${GREEN}Nginx configured & restarted${NC}"

# Firewall
echo -e "${YELLOW}Setting up firewall...${NC}"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80
ufw allow 443
ufw --force enable
echo -e "${GREEN}Firewall active${NC}"

# Migrate & Start
cd $APP_DIR
echo -e "${YELLOW}Running migration...${NC}"
node --env-file=.env scripts/migrate-env-to-db.js

echo -e "${YELLOW}Starting app with PM2...${NC}"
pm2 delete tim-report-bot 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# Auto-start on reboot
STARTUP_CMD=$(pm2 startup | tail -1)
eval $STARTUP_CMD 2>/dev/null || true

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  SETUP COMPLETE!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "  Admin Panel: https://report.grup138.com"
echo "  Login:       admin / admin"
echo ""
echo "  PM2 status:  pm2 status"
echo "  PM2 logs:    pm2 logs tim-report-bot"
echo ""
echo "  Selanjutnya:"
echo "  1. Buka https://report.grup138.com"
echo "  2. Login → Brands → Add brands"
echo "  3. Paste cookie dari browser"
echo "  4. Test fetch"
echo ""
FINISHEOF

  chmod +x $APP_DIR/scripts/vps-finish.sh
  exit 0
fi

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  STEP 1-8 DONE!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "  Selanjutnya jalankan:"
echo -e "  ${YELLOW}bash $APP_DIR/scripts/vps-finish.sh${NC}"
echo ""
