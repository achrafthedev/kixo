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
scp -i "$KEY" -q "$tmp/site.tgz" deploy/nginx-kixo.app.conf "$HOST:/tmp/"
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
nginx -t && systemctl reload nginx
if [ "${1:-}" = "--https" ]; then
  certbot --nginx -d kixo.app -d www.kixo.app --redirect --non-interactive --agree-tos --register-unsafely-without-email
fi
echo "deployed: $(ls /var/www/kixo | tr '\n' ' ')"
EOF
