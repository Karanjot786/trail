#!/usr/bin/env bash
# Starts the agent probe behind two Cloudflare quick tunnels and prints the URL
# to send the AI agent to. Ctrl-C stops everything. Needs cloudflared and Go.
# Run from the Trail repo root: scripts/agentprobe/run.sh
set -euo pipefail
dir=.probe
mkdir -p "$dir"
pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 130' INT TERM

go build -o "$dir/agentprobe" ./scripts/agentprobe
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8331 >"$dir/tunnel-a.log" 2>&1 &
pids+=($!)
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8332 >"$dir/tunnel-b.log" 2>&1 &
pids+=($!)

url_in() { # waits for the quick-tunnel URL in log $1
  for _ in $(seq 1 60); do
    url=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$1" | head -1 || true)
    if [ -n "$url" ]; then echo "$url"; return 0; fi
    sleep 1
  done
  echo "cloudflared did not print a URL; see $1" >&2
  return 1
}
a_url=$(url_in "$dir/tunnel-a.log")
b_url=$(url_in "$dir/tunnel-b.log")

"$dir/agentprobe" -b-url "$b_url" -log "$dir/log.ndjson" &
pids+=($!)
sleep 2
echo
echo "Probe page (send the agent here): $a_url"
echo "Log: $dir/log.ndjson   (Ctrl-C to stop)"
wait
