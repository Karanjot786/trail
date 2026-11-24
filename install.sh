#!/bin/sh
# Install or update Trail from GitHub Releases.
#
#   curl -fsSL https://raw.githubusercontent.com/karanjot786/trail/main/install.sh | sh
#
# It downloads the binary for this OS and CPU, checks it against the release's
# checksums.txt and puts it in /usr/local/bin. On Linux with systemd it also
# creates a `trail` user, /var/lib/trail, /etc/trail.env and a trail.service,
# then starts it. Running it again updates the binary and restarts the service;
# your settings and data are left alone.
#
# Settings (environment variables):
#   TRAIL_VERSION      release tag to install, e.g. v0.3.0 (default: latest)
#   TRAIL_ADDR         listen address written to a new /etc/trail.env (default: 127.0.0.1:8080)
#   TRAIL_TZ           IANA time zone written to a new /etc/trail.env (default: this server's zone, else UTC)
#   TRAIL_INSTALL_DIR  where the binary goes (default: /usr/local/bin)
#   TRAIL_NO_SERVICE   1 skips the systemd setup
#   TRAIL_DOWNLOAD_URL base URL holding the archives and checksums.txt (default: GitHub Releases)
set -eu

REPO=karanjot786/trail

say() { printf '%s\n' "$*"; }
die() { printf 'install.sh: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# as_root runs a command as root, through sudo when needed.
as_root() {
	if [ "$(id -u)" -eq 0 ]; then
		"$@"
	elif have sudo; then
		sudo "$@"
	else
		die "need root for: $* (run as root or install sudo)"
	fi
}

fetch() { # fetch URL FILE
	if have curl; then
		curl -fsSL --proto '=https,file' -o "$2" "$1"
	elif have wget; then
		wget -qO "$2" "$1"
	else
		die "need curl or wget"
	fi
}

sha256() {
	if have sha256sum; then
		sha256sum "$1" | cut -d' ' -f1
	elif have shasum; then
		shasum -a 256 "$1" | cut -d' ' -f1
	else
		die "need sha256sum or shasum to verify the download"
	fi
}

detect() {
	case "$(uname -s)" in
	Linux) OS=linux ;;
	Darwin) OS=darwin ;;
	FreeBSD) OS=freebsd ;;
	*) die "unsupported OS $(uname -s); build from source, see SELF_HOSTING.md" ;;
	esac
	case "$(uname -m)" in
	x86_64 | amd64) ARCH=amd64 ;;
	aarch64 | arm64) ARCH=arm64 ;;
	*) die "unsupported CPU $(uname -m); build from source, see SELF_HOSTING.md" ;;
	esac
}

install_binary() {
	version=${TRAIL_VERSION:-latest}
	if [ -n "${TRAIL_DOWNLOAD_URL:-}" ]; then
		base=${TRAIL_DOWNLOAD_URL%/}
	elif [ "$version" = latest ]; then
		base="https://github.com/$REPO/releases/latest/download"
	else
		base="https://github.com/$REPO/releases/download/$version"
	fi
	name="trail_${OS}_${ARCH}.tar.gz"
	tmp=$(mktemp -d)
	trap 'rm -rf "$tmp"' EXIT

	say "Downloading $name ($version)"
	fetch "$base/$name" "$tmp/$name" || die "download failed: $base/$name"
	fetch "$base/checksums.txt" "$tmp/checksums.txt" || die "download failed: $base/checksums.txt"
	want=$(awk -v n="$name" '$2 == n || $2 == "*"n { print $1 }' "$tmp/checksums.txt")
	[ -n "$want" ] || die "$name is not listed in checksums.txt"
	got=$(sha256 "$tmp/$name")
	[ "$got" = "$want" ] || die "checksum mismatch for $name: got $got, want $want"
	say "Checksum OK"

	tar -xzf "$tmp/$name" -C "$tmp" trail
	dir=${TRAIL_INSTALL_DIR:-/usr/local/bin}
	mkdir -p "$dir" 2>/dev/null || true
	if [ -d "$dir" ] && [ -w "$dir" ]; then
		install -m 0755 "$tmp/trail" "$dir/trail"
	else
		as_root mkdir -p "$dir"
		as_root install -m 0755 "$tmp/trail" "$dir/trail"
	fi
	BIN="$dir/trail"
	say "Installed $("$BIN" version) to $BIN"
}

# host_tz prints this server's IANA time zone, or UTC when it cannot tell.
host_tz() {
	tz=
	if have timedatectl; then
		tz=$(timedatectl show -p Timezone --value 2>/dev/null || true)
	fi
	if [ -z "$tz" ] && [ -r /etc/timezone ]; then
		tz=$(head -n 1 /etc/timezone 2>/dev/null || true)
	fi
	if [ -z "$tz" ] && [ -L /etc/localtime ]; then
		tz=$(readlink /etc/localtime 2>/dev/null || true)
		tz=${tz#*zoneinfo/}
	fi
	case $tz in
	"" | */../* | ../* | /* | *..*) tz=UTC ;;
	esac
	if [ ! -e "/usr/share/zoneinfo/$tz" ]; then
		tz=UTC
	fi
	printf '%s\n' "$tz"
}

setup_service() {
	if [ -f /etc/systemd/system/trail.service ]; then
		as_root systemctl restart trail
		say "Restarted trail.service. Settings in /etc/trail.env are unchanged."
		return
	fi
	if ! id trail >/dev/null 2>&1; then
		as_root useradd --system --home-dir /var/lib/trail --create-home --shell /usr/sbin/nologin trail
	fi
	as_root mkdir -p /var/lib/trail
	as_root chown trail:trail /var/lib/trail
	as_root chmod 0750 /var/lib/trail
	if [ ! -f /etc/trail.env ]; then
		as_root sh -c "umask 077; cat >/etc/trail.env" <<EOF
# Trail settings, read by trail.service. See SELF_HOSTING.md for every option.
TRAIL_DB=/var/lib/trail/trail.db
TRAIL_ADDR=${TRAIL_ADDR:-127.0.0.1:8080}
TRAIL_TZ=${TRAIL_TZ:-$(host_tz)}
# Leave TRAIL_PASSWORD unset to use the password printed in the log on first start.
#TRAIL_PASSWORD=
#TRAIL_SITES=blog=example.com
EOF
	fi
	as_root sh -c "cat >/etc/systemd/system/trail.service" <<EOF
[Unit]
Description=Trail web analytics
After=network-online.target
Wants=network-online.target

[Service]
User=trail
Group=trail
EnvironmentFile=/etc/trail.env
ExecStart=$BIN serve
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/trail
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
	as_root systemctl daemon-reload
	as_root systemctl enable --now trail

	pw=""
	i=0
	while [ $i -lt 15 ] && [ -z "$pw" ]; do
		sleep 1
		pw=$(as_root journalctl -u trail --no-pager -o cat 2>/dev/null | sed -n 's/.*Log in with:  //p' | tail -n 1)
		i=$((i + 1))
	done
	addr=$(as_root sed -n 's/^TRAIL_ADDR=//p' /etc/trail.env)
	say ""
	say "Trail is running (systemctl status trail) and listening on $addr."
	if [ -n "$pw" ]; then
		say "Dashboard password: $pw"
		say "It is shown only once. Set TRAIL_PASSWORD in /etc/trail.env to choose your own."
	else
		say "Find the dashboard password with: journalctl -u trail | grep 'Log in'"
	fi
	say ""
	say "Next: serve it over HTTPS. With Caddy installed, put this in /etc/caddy/Caddyfile:"
	say "  stats.example.com {"
	say "  	reverse_proxy $addr"
	say "  }"
	say "then: sudo systemctl reload caddy. Full guide: https://github.com/$REPO/blob/main/SELF_HOSTING.md"
}

main() {
	detect
	install_binary
	if [ "${TRAIL_NO_SERVICE:-}" = 1 ] || [ "$OS" != linux ] || [ ! -d /run/systemd/system ]; then
		say ""
		say "Run it with:"
		say "  TRAIL_DB=\$HOME/trail.db $BIN serve"
		say "The first start prints the dashboard password. Open http://localhost:8080."
		say "Full guide: https://github.com/$REPO/blob/main/SELF_HOSTING.md"
		return
	fi
	setup_service
}

main "$@"
