---
title: Binary, systemd and Caddy
description: Install the Trail binary and a systemd service with one command, or build it yourself, and put Caddy in front for HTTPS.
---

# Binary, systemd and Caddy

Trail compiles to a single static file (`CGO_ENABLED=0`) with the tracker and the dashboard embedded. Copy it to any Linux server and run it.

## Install script

```sh
curl -fsSL https://raw.githubusercontent.com/karanjot786/trail/main/install.sh | sh
```

The script:

1. downloads `trail_<os>_<cpu>.tar.gz` from the latest [GitHub release](https://github.com/karanjot786/trail/releases) (Linux, macOS and FreeBSD; amd64 and arm64);
2. checks it against the release's `checksums.txt` and stops on a mismatch;
3. installs `/usr/local/bin/trail`;
4. on Linux with systemd: creates a `trail` system user, `/var/lib/trail`, `/etc/trail.env` (mode 600, listening on `127.0.0.1:8080`) and the hardened `trail.service` shown [below](#systemd), starts it and prints the generated dashboard password.

Running it again updates the binary and restarts the service. It never touches an existing `/etc/trail.env` or the database.

| Variable | Effect |
|---|---|
| `TRAIL_VERSION=v0.3.1` | Install that release instead of the latest |
| `TRAIL_ADDR=:8080` | Listen address for a new `/etc/trail.env` (default `127.0.0.1:8080`) |
| `TRAIL_INSTALL_DIR=$HOME/.local/bin` | Put the binary elsewhere |
| `TRAIL_NO_SERVICE=1` | Install the binary only |

Pass them to `sh`, e.g. `curl -fsSL .../install.sh | TRAIL_NO_SERVICE=1 sh`. To read the script first, download it, look, then run `sh install.sh`. Or do it by hand: download the archive and `checksums.txt` from the release page, run `sha256sum -c --ignore-missing checksums.txt`, and unpack `trail`.

Then add HTTPS with [Caddy](#caddy).

## Build from source

On your machine, with Go 1.26+, Node 22+ and pnpm:

```sh
git clone https://github.com/karanjot786/trail && cd trail
make build                                   # tracker, dashboard, then ./trail
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
  go build -trimpath -ldflags="-s -w" -o trail-linux ./cmd/trail
scp trail-linux server:/usr/local/bin/trail
```

`make build` must run first so the dashboard and tracker files exist to be embedded. The cross-compile line reuses them.

## systemd

Create a user and a data directory:

```sh
sudo useradd --system --home /var/lib/trail --create-home trail
```

Put the settings in an environment file readable only by root. `TRAIL_PASSWORD` and `TRAIL_SECRET` are optional: without them the first start logs a generated password (`journalctl -u trail | grep 'Log in'`) and keeps the session key in the database.

::: code-group
```ini [/etc/trail.env]
TRAIL_PASSWORD=change-me
TRAIL_SITES=mysite=example.com
TRAIL_DB=/var/lib/trail/trail.db
TRAIL_ADDR=127.0.0.1:8080
TRAIL_TZ=Europe/Berlin
```
:::

::: code-group
```ini [/etc/systemd/system/trail.service]
[Unit]
Description=Trail analytics
After=network-online.target
Wants=network-online.target

[Service]
User=trail
EnvironmentFile=/etc/trail.env
ExecStart=/usr/local/bin/trail serve
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/trail
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```
:::

```sh
sudo chmod 600 /etc/trail.env
sudo systemctl daemon-reload
sudo systemctl enable --now trail
journalctl -u trail -f
```

Trail stops cleanly on `SIGTERM`: it finishes in-flight requests and flushes queued events before closing the database.

## Caddy

Binding to `127.0.0.1` keeps Trail private; Caddy serves it over HTTPS and sets `X-Forwarded-For` and `X-Forwarded-Proto` for you. Trail trusts that header because Caddy connects from loopback (see [Client IP and proxies](/operations/configuration#client-ip)).

::: code-group
```txt [/etc/caddy/Caddyfile]
stats.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}
```
:::

```sh
sudo systemctl reload caddy
```

Then add the `/_t/*` rewrite on the sites you track, so the tracker loads from their own domain. See [Rewrites](/install/rewrites).

## Next

- Back up the database: [Backups](/operations/backups).
- Open the dashboard and sign in: [First run in the dashboard](/dashboard/first-run) walks you through adding your site.
- Then [add the script tag](/add/script-tag) to your site.
