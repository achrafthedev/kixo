#!/usr/bin/env bash
# Deploy kixo.app to the VPS: uploads site/ (minus deploy/) and the nginx vhost,
# tests nginx before reloading. Run from the repo root:  bash site/deploy/deploy.sh
# First time after DNS points at the VPS, add HTTPS:      bash site/deploy/deploy.sh --https
set -euo pipefail
HOST=root@173.249.4.103
KEY="$HOME/.ssh/id_ed25519_vps"
cd "$(dirname "$0")/.."

tmp=$(mktemp -d)
tar --exclude=./deploy -czf "$tmp/site.tgz" .
scp -i "$KEY" -q "$tmp/site.tgz" deploy/nginx-kixo.app.conf deploy/nginx-kixo-api.conf deploy/nginx-kixo-ratelimit.conf "$HOST:/tmp/"
rm -rf "$tmp"

ssh -i "$KEY" "$HOST" bash -s -- "${1:-}" <<'EOF'
set -euo pipefail
mkdir -p /var/www/kixo
tar -xzf /tmp/site.tgz -C /var/www/kixo
chown -R www-data:www-data /var/www/kixo
# Keep certbot's HTTPS edits: only install the vhost the first time.
if [ ! -f /etc/nginx/sites-available/kixo.app ]; then
  cp /tmp/nginx-kixo.app.conf /etc/nginx/sites-available/kixo.app
  ln -sf /etc/nginx/sites-available/kixo.app /etc/nginx/sites-enabled/kixo.app
fi
# Overlay relay: snippet + rate limits are always synced; the include line is
# added once to the (certbot-managed) vhost, right after its root directive.
mkdir -p /etc/nginx/snippets
cp /tmp/nginx-kixo-api.conf /etc/nginx/snippets/kixo-api.conf
cp /tmp/nginx-kixo-ratelimit.conf /etc/nginx/conf.d/kixo-ratelimit.conf
V=/etc/nginx/sites-available/kixo.app
if ! grep -q 'snippets/kixo-api.conf' "$V"; then
  cp "$V" /root/kixo.app.vhost.bak
  sed -i '0,/root \/var\/www\/kixo;/s//root \/var\/www\/kixo;\n    include snippets\/kixo-api.conf;/' "$V"
fi
if ! nginx -t; then
  # Never leave nginx broken on the shared server: roll back and stop.
  [ -f /root/kixo.app.vhost.bak ] && cp /root/kixo.app.vhost.bak "$V"
  rm -f /etc/nginx/snippets/kixo-api.conf /etc/nginx/conf.d/kixo-ratelimit.conf
  sed -i '/snippets\/kixo-api.conf/d' "$V"
  nginx -t && echo "ROLLED BACK overlay relay (nginx test failed)" && exit 1
fi
systemctl reload nginx
if [ "${1:-}" = "--https" ]; then
  certbot --nginx -d kixo.app -d www.kixo.app --redirect --non-interactive --agree-tos --register-unsafely-without-email
fi
echo "deployed: $(ls /var/www/kixo | tr '\n' ' ')"
EOF
