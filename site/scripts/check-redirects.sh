#!/usr/bin/env bash
# Usage: check-redirects.sh BASE_URL. Exits non-zero on the first mismatch.
set -u
BASE="${1:?usage: check-redirects.sh BASE_URL}"
BASE="${BASE%/}"

check() { # path, expected status, header regex (optional, matched case-insensitively)
  local path="$1" want="$2" hdr="${3:-}"
  local head status
  head="$(curl -sI "$BASE$path")"
  status="$(printf '%s' "$head" | head -1 | awk '{print $2}')"
  if [ "$status" != "$want" ]; then echo "FAIL $path: status $status, want $want"; exit 1; fi
  if [ -n "$hdr" ] && ! printf '%s' "$head" | grep -qiE "$hdr"; then echo "FAIL $path: header does not match $hdr"; printf '%s\n' "$head"; exit 1; fi
  echo "OK   $path -> $status"
}

check /docs/install/docker/ 308 '^location: /docs/install/docker\r?$'
check /docs 200 '^content-type: text/html'
check /docs/ 308 '^location: /docs\r?$'
check /docs/quickstart 200 '^content-type: text/html'
check /docs/quickstart.md 200 '^content-type: text/markdown'
check /llms.txt 200
check /sitemap.xml 200
check /docs/nope 404
