---
title: Binary, systemd and Caddy
description: Build one static binary, run it under systemd and put Caddy in front for HTTPS.
---

# Binary, systemd and Caddy

Trail compiles to a single static file (`CGO_ENABLED=0`) with the tracker and the dashboard embedded. Copy it to any Linux server and run it.

## Build

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

Put the settings in an environment file readable only by root:

::: code-group
```ini [/etc/trail.env]
TRAIL_PASSWORD=change-me
TRAIL_SITES=mysite=example.com
TRAIL_SECRET=paste-the-output-of-openssl-rand-hex-32
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
- Then [add the script tag](/add/script-tag) to your site.
