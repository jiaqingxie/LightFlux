#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for package_dir in lightflux server cli; do
  echo "Installing ${package_dir} dependencies..."
  npm --prefix "${repo_root}/${package_dir}" ci --no-audit --no-fund
done

echo "Migrating the local development database..."
npm --prefix "${repo_root}/server" run db:migrate
