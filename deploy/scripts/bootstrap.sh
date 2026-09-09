#!/usr/bin/env bash
# One-time bootstrap for an Ubuntu/Debian or RHEL-compatible Linux host.
#
# Installs Docker, nginx, and certbot, installs the reverse-proxy config, and
# obtains the TLS certificate. Run once on a fresh server, as root.
#
# Prerequisites:
#   - DOMAIN resolves to this server.
#   - Inbound TCP 80 and 443 are open.
#
# Usage:
#   DOMAIN=api.example.com CERT_EMAIL=you@example.com bash bootstrap.sh
set -euo pipefail

DOMAIN="${DOMAIN:?DOMAIN is required}"
CERT_EMAIL="${CERT_EMAIL:-}"
WEB_ROOT="${WEB_ROOT:-/opt/lightflux/web}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { echo "=== $* ==="; }

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

log "install docker"
if ! command -v docker >/dev/null 2>&1; then
  bash "${SCRIPT_DIR}/install-docker.sh"
else
  echo "docker already installed: $(docker --version)"
fi

log "install nginx + certbot"
if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    nginx certbot python3-certbot-nginx
elif command -v dnf >/dev/null 2>&1; then
  dnf -y install nginx certbot python3-certbot-nginx
else
  echo "Unsupported package manager. Install nginx and certbot manually." >&2
  exit 1
fi

log "install reverse-proxy config"
mkdir -p "${WEB_ROOT}"
sed \
  -e "s|__DOMAIN__|${DOMAIN}|g" \
  -e "s|__WEB_ROOT__|${WEB_ROOT}|g" \
  "${SCRIPT_DIR}/../nginx/lightflux.conf.template" \
  > /etc/nginx/conf.d/lightflux.conf
nginx -t
systemctl enable --now nginx
systemctl reload nginx

log "obtain TLS certificate for ${DOMAIN}"
if [[ -n "${CERT_EMAIL}" ]]; then
  certbot --nginx -d "${DOMAIN}" \
    --non-interactive --agree-tos --redirect -m "${CERT_EMAIL}"
else
  echo "CERT_EMAIL not set; registering without contact email."
  certbot --nginx -d "${DOMAIN}" \
    --non-interactive --agree-tos --redirect --register-unsafely-without-email
fi

log "enable certificate auto-renewal"
systemctl enable --now certbot-renew.timer

log "bootstrap complete - deploy the API with deploy/scripts/deploy.sh"
