#!/usr/bin/env bash
# Install Docker Engine and the Compose plugin from Docker's official installer.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

installer="$(mktemp)"
trap 'rm -f "${installer}"' EXIT

curl -fsSL https://get.docker.com -o "${installer}"
sh "${installer}"

systemctl enable --now docker
docker --version
docker compose version
