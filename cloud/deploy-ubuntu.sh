#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/niu-dashboard"
TOKEN="${NIU_TOKEN:-$(openssl rand -hex 24)}"

echo "[1/5] Installing Node.js and PM2 if needed..."
apt-get update
apt-get install -y ca-certificates curl nginx openssl
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

echo "[2/5] Installing app..."
mkdir -p "$APP_DIR/data"
cp server.js package.json ecosystem.config.cjs "$APP_DIR/"
sed -i "s/CHANGE_ME_WRITE_TOKEN/$TOKEN/g" "$APP_DIR/ecosystem.config.cjs"

echo "[3/5] Starting app with PM2..."
cd "$APP_DIR"
pm2 startOrReload ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root || true

echo "[4/5] Configuring Nginx on port 80..."
cat >/etc/nginx/sites-available/niu-dashboard <<'NGINX'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/niu-dashboard /etc/nginx/sites-enabled/niu-dashboard
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "[5/5] Done."
PUBLIC_IP="$(curl -fsS --max-time 3 https://api.ipify.org || hostname -I | awk '{print $1}')"
echo
echo "Dashboard: http://${PUBLIC_IP}/"
echo "Shortcut POST URL: http://${PUBLIC_IP}/niu?token=${TOKEN}"
echo
echo "Save this token. It is stored in $APP_DIR/ecosystem.config.cjs"
