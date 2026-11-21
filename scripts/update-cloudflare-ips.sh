#!/usr/bin/env bash
# Refresh the bundled Cloudflare edge ranges (internal/netx/cloudflare-v*.txt)
# from https://www.cloudflare.com/ips-v4 and ips-v6. Trail trusts
# CF-Connecting-IP only from these ranges; rebuild after running this.
set -euo pipefail

cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

for v in 4 6; do
  curl -fsSL --retry 3 --max-time 30 -o "$tmp/v$v" "https://www.cloudflare.com/ips-v$v"
  # Keep only CIDR-looking lines; refuse an empty or odd response.
  grep -E '^[0-9a-fA-F:.]+/[0-9]+$' "$tmp/v$v" > "$tmp/v$v.clean" || true
  if [ ! -s "$tmp/v$v.clean" ] || [ "$(wc -l < "$tmp/v$v.clean")" -ne "$(grep -c . "$tmp/v$v")" ]; then
    echo "update-cloudflare-ips: unexpected ips-v$v response; keeping the current file" >&2
    exit 1
  fi
  mv "$tmp/v$v.clean" "internal/netx/cloudflare-v$v.txt"
done
go test ./internal/netx/
