#!/usr/bin/env bash
# Refresh the embedded DB-IP Lite Country database (CC BY 4.0, https://db-ip.com).
# Tries this month's file, then last month's; validates it; replaces
# internal/enrich/geodata/dbip-country-lite.mmdb only when it changed.
# Prints the build month (YYYY-MM) on the last line.
set -euo pipefail

cd "$(dirname "$0")/.."
dest=internal/enrich/geodata/dbip-country-lite.mmdb
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

this=$(date -u +%Y-%m)
# GNU date, then BSD date (macOS).
prev=$(date -u -d "$this-01 -1 month" +%Y-%m 2>/dev/null || date -u -v1d -v-1m +%Y-%m)

got=""
for m in "$this" "$prev"; do
  url="https://download.db-ip.com/free/dbip-country-lite-$m.mmdb.gz"
  if curl -fsSL --retry 3 --max-time 300 -o "$tmp/db.mmdb.gz" "$url"; then
    got=$m
    break
  fi
  echo "update-geo: $m not available" >&2
done
if [ -z "$got" ]; then
  echo "update-geo: no DB-IP file for $this or $prev; keeping the current one" >&2
  exit 1
fi

gunzip -t "$tmp/db.mmdb.gz"
gunzip -c "$tmp/db.mmdb.gz" > "$tmp/db.mmdb"
build=$(go run ./scripts/geocheck "$tmp/db.mmdb")

if cmp -s "$tmp/db.mmdb" "$dest"; then
  echo "update-geo: $dest is already the $build edition" >&2
else
  # Copy next to the target first so the final rename is atomic.
  cp "$tmp/db.mmdb" "$dest.tmp"
  mv "$dest.tmp" "$dest"
  echo "update-geo: replaced $dest with the $build edition (downloaded as $got)" >&2
fi
echo "$build"
