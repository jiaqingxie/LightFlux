#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for package_dir in shared lightflux cli; do
  echo "Installing ${package_dir} dependencies..."
  npm --prefix "${repo_root}/${package_dir}" ci --no-audit --no-fund
done
