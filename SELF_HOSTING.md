# Self-hosting Trail

Trail is one Go binary with the dashboard and the tracker inside it, and one SQLite file for the data. There is no database server, queue or cache to run. This guide gets it running on your own machine in one or two commands, then covers HTTPS, updates, backups and every setting.

- [Prerequisites](#prerequisites)
- [Option 1: Docker, one command](#option-1-docker-one-command)
- [Option 2: Docker Compose with automatic HTTPS, two commands](#option-2-docker-compose-with-automatic-https-two-commands)
- [Option 3: Binary and systemd, no Docker](#option-3-binary-and-systemd-no-docker)
- [First login and adding a site](#first-login-and-adding-a-site)
- [Updating](#updating)
- [Backups](#backups)
- [Environment variables](#environment-variables)
- [Reverse proxies and the visitor IP](#reverse-proxies-and-the-visitor-ip)
- [Troubleshooting](#troubleshooting)
- [Other platforms](#other-platforms)

## Prerequisites

- A Linux server (amd64 or arm64). The smallest VPS is plenty to start; a Mac or a Raspberry Pi 4 works too.
- For HTTPS: a domain or subdomain, such as `stats.example.com`, whose DNS `A`/`AAAA` record points at the server, and ports 80 and 443 open.
- Docker with the Compose plugin for options 1 and 2 (`curl -fsSL https://get.docker.com | sh` installs both), or nothing at all for option 3.

You do not need to set a password or a secret. On first start Trail generates a dashboard password, prints it once in the log, and keeps the session-signing key in its database, so logins survive restarts. Set `TRAIL_PASSWORD` if you would rather choose your own.

## Option 1: Docker, one command

```sh
docker run -d --name trail --restart unless-stopped -p 8080:8080 -v trail-data:/data ghcr.io/karanjot786/trail
```

Then read the generated password and open http://localhost:8080 (or `http://<server-ip>:8080`):

```sh
docker logs trail 2>&1 | grep 'Log in'
```

To pick the password yourself, add `-e TRAIL_PASSWORD=...`. Everything Trail stores is in the `trail-data` volume, at `/data/trail.db`.

The image is about 40 MB, runs as a non-root user on a distroless base, and has a built-in health check (`docker ps` shows `healthy`). Tags: `latest` is the newest release, `X.Y.Z` and `X.Y` pin a release, and `edge` follows the `main` branch.

Plain HTTP is fine for trying Trail out. For real sites, put it behind HTTPS: browsers send the session cookie securely, and many sites block scripts loaded over plain HTTP. Option 2 does that for you.

## Option 2: Docker Compose with automatic HTTPS, two commands

[`deploy/compose.yaml`](deploy/compose.yaml) runs Trail behind [Caddy](https://caddyserver.com), which gets and renews a Let's Encrypt certificate on its own.

```sh
curl -fsSLO https://raw.githubusercontent.com/karanjot786/trail/main/deploy/compose.yaml
echo "DOMAIN=stats.example.com" > .env && docker compose up -d
```

Open `https://stats.example.com` and log in with the password from:

```sh
docker compose logs trail | grep 'Log in'
```

To keep the settings for later `docker compose` commands, put them in a `.env` file next to `compose.yaml` instead of on the command line:

```sh
DOMAIN=stats.example.com
TRAIL_PASSWORD=choose-a-long-one     # optional
TRAIL_TZ=Europe/Berlin               # optional, default UTC
TRAIL_SITES=blog=example.com         # optional, you can add sites in the dashboard
```

Trail's port is not published; only Caddy reaches it, over the private Compose network, so the visitor IP that Caddy forwards is trusted with no extra setup.

If ports 80 and 443 are already taken by another proxy on the server, skip Compose: run option 1 with `-p 127.0.0.1:8080:8080` and point your existing proxy at it (see [Reverse proxies](#reverse-proxies-and-the-visitor-ip)).

## Option 3: Binary and systemd, no Docker

```sh
curl -fsSL https://raw.githubusercontent.com/karanjot786/trail/main/install.sh | sh
```

The script:

1. downloads the right archive for your OS and CPU from the latest GitHub release;
2. checks it against the release's `checksums.txt` and stops on a mismatch;
3. installs `trail` to `/usr/local/bin`;
4. on Linux with systemd, creates a `trail` system user, `/var/lib/trail` for the database, `/etc/trail.env` (mode 600) for settings and a hardened `trail.service`, starts it and prints the dashboard password.

Trail then listens on `127.0.0.1:8080`, so add HTTPS with Caddy:

```
# /etc/caddy/Caddyfile
stats.example.com {
	reverse_proxy 127.0.0.1:8080
}
```

```sh
sudo systemctl reload caddy
```

Options for the script, set as environment variables: `TRAIL_VERSION=v0.3.0` pins a release, `TRAIL_ADDR=:8080` listens on every interface, `TRAIL_INSTALL_DIR=$HOME/.local/bin` installs elsewhere, and `TRAIL_NO_SERVICE=1` skips systemd. For example:

```sh
curl -fsSL https://raw.githubusercontent.com/karanjot786/trail/main/install.sh | TRAIL_NO_SERVICE=1 TRAIL_INSTALL_DIR=$HOME/.local/bin sh
```

Prefer to read the script before running it? Download it, look, then run `sh install.sh`. Or skip it: download `trail_linux_amd64.tar.gz` and `checksums.txt` from the [releases page](https://github.com/karanjot786/trail/releases), check with `sha256sum -c --ignore-missing checksums.txt`, and run `TRAIL_DB=/var/lib/trail/trail.db trail serve` however you like.

To build from source instead (Go 1.26+, Node 22+, pnpm): `git clone https://github.com/karanjot786/trail && cd trail && make build`.

## First login and adding a site

1. Open the dashboard and log in with the generated password (or your `TRAIL_PASSWORD`).
2. Go to **Settings → Add site** and enter the domain the site runs on.
3. Copy the snippet from the site's **Install** panel into your site's `<head>`:

   ```html
   <script defer src="https://stats.example.com/_t/t.js" data-site="blog"></script>
   ```

4. The panel shows "Waiting for the first event…" until your first visit lands.

Lost the generated password? Make a new one and restart:

```sh
docker exec trail /trail reset-password && docker restart trail   # Docker
docker compose exec trail /trail reset-password && docker compose restart trail   # Compose
sudo -u trail env TRAIL_DB=/var/lib/trail/trail.db trail reset-password && sudo systemctl restart trail   # systemd
```

Setting `TRAIL_PASSWORD` always wins over the generated password.

## Updating

Schema changes run at startup, so an update is a new binary or image over the same database. [Back up](#backups) first.

| Install | Update |
|---|---|
| Docker | `docker pull ghcr.io/karanjot786/trail && docker rm -f trail`, then the same `docker run` as before |
| Compose | `docker compose pull && docker compose up -d` |
| Binary | run the install script again: it replaces the binary and restarts the service, leaving `/etc/trail.env` and the data alone |

Pin a version (`ghcr.io/karanjot786/trail:0.3`, `TRAIL_VERSION=v0.3.0`) if you want to choose when to move. Read the [changelog](site/docs/changelog.md) before a big jump. The tracker is embedded, so your sites get the new `t.js` once the server restarts.

## Backups

Everything (events, sites, goals, tokens, the generated password and session key) is in one SQLite file. Back it up and you have backed up Trail.

The safe way while Trail runs is SQLite's online backup, which writes a consistent copy:

```sh
# systemd install
sqlite3 /var/lib/trail/trail.db ".backup /backups/trail-$(date +%F).db"

# Docker or Compose (the image has no shell, so use a throwaway container;
# with Compose the volume is called trail_trail-data)
docker run --rm -v trail-data:/data -v /backups:/backups alpine \
  sh -c 'apk add -q sqlite && sqlite3 /data/trail.db ".backup /backups/trail-$(date +%F).db"'
```

Run it daily from cron (write `%` as `\%` inside a crontab), and copy `/backups` off the server.

When Trail is stopped, a plain `cp` of `trail.db` is a complete backup. While it runs, a plain copy can miss writes still in `trail.db-wal`, so use `.backup`.

To restore or move servers: stop Trail, put the backup at the `TRAIL_DB` path, delete any `trail.db-wal` and `trail.db-shm` beside it, start Trail.

## Environment variables

None are required.

| Variable | Default | What it does |
|---|---|---|
| `TRAIL_PASSWORD` | generated | Dashboard password. Unset: one is generated on first start, printed once in the log, and only its hash is stored. 5 wrong passwords from one address lock it out for 15 minutes; failures are logged as `auth: failed login from ...` |
| `TRAIL_SECRET` | stored in the database | Signs session cookies, 32+ characters. Unset: a random key is created on first start and kept in the database, so logins survive restarts |
| `TRAIL_DB` | `trail.db` (`/data/trail.db` in Docker, `/var/lib/trail/trail.db` with install.sh) | Path of the SQLite file |
| `TRAIL_ADDR` | `:8080` | Listen address. `127.0.0.1:8080` keeps it private behind a local proxy |
| `TRAIL_SITES` | empty | `id=domain,id2=domain2`, added at startup if missing. Or add sites in **Settings** |
| `TRAIL_TZ` | `UTC` (install.sh writes the server's own zone) | IANA timezone for daily buckets, e.g. `Europe/Berlin`. The dashboard shows days in this zone. A bad name stops the server at start |
| `TRAIL_TRUSTED_PROXIES` | `private,cloudflare` | Which proxies may report the visitor IP. See below |
| `TRAIL_GEO_DB` | unset | Path to a City `.mmdb` (DB-IP Lite City, GeoLite2 City) for region and city. Country works without it |
| `TRAIL_API_TOKENS` | unset | `name:token:scope,...` for the read API and MCP. You can also create tokens in **Settings** |
| `TRAIL_INGEST_RPS` | `50` | Event requests per second per visitor IP, burst twice that. `0` turns it off |
| `TRAIL_AGENT_LISTS` | unset | `off` stops fetching the published AI agent IP lists |
| `TRAIL_DEMO` | unset | `1` serves a read-only demo at `/demo` |

The full reference, with allowed origins and environments, is in [Configuration](site/docs/operations/configuration.md).

Commands, run as `trail <command>` (`docker exec trail /trail <command>` in Docker):

| Command | What it does |
|---|---|
| `serve` | Run the server (the default) |
| `health` | Exit 0 if the local server answers `/healthz`. The Docker health check uses it |
| `reset-password` | Replace the generated password and print the new one. Restart Trail afterwards |
| `version` | Print the version |
| `seed` | Fill `TRAIL_DB` with fake data, for trying the dashboard |
| `crawlers import` | Import AI crawler hits from server logs |

`GET /healthz` returns `200 ok` when the server and its database answer, for uptime monitors and load balancers. It needs no login.

## Reverse proxies and the visitor IP

Trail uses the visitor IP for the per-IP rate limit, the country lookup and the private-mode visitor key, and never stores it. It reads `X-Forwarded-For` (and `CF-Connecting-IP` from Cloudflare) only when the connection comes from a proxy it trusts. The default, `private,cloudflare`, trusts loopback and private networks plus Cloudflare's published ranges, which covers a proxy on the same machine, a Docker network and Cloudflare.

**Caddy** sets the headers for you:

```
stats.example.com {
	reverse_proxy 127.0.0.1:8080
}
```

**nginx:**

```nginx
server {
    listen 443 ssl;
    server_name stats.example.com;
    # ssl_certificate ... (certbot --nginx fills these in)

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Cloudflare** in front (orange cloud) works with the default, directly or through a local Caddy or nginx. Use SSL mode "Full (strict)".

**A load balancer with a public IP** (some cloud load balancers): add its address, e.g. `TRAIL_TRUSTED_PROXIES=private,198.51.100.0/24`. A list replaces the default, so keep `private` or `cloudflare` if you need them.

Whatever the proxy, publish Trail's port on `127.0.0.1` only (`-p 127.0.0.1:8080:8080`, or `TRAIL_ADDR=127.0.0.1:8080`) so nobody reaches it around the proxy. The session cookie is marked `Secure` when the proxy sends `X-Forwarded-Proto: https`.

To load the tracker from your own site's domain (it survives more ad blockers), add a `/_t/*` rewrite there: see [Rewrites](site/docs/install/rewrites.md).

## Troubleshooting

- **`unable to open database file` in Docker.** The volume's directory is not writable by the container user (uid 65532). Use a named volume (`-v trail-data:/data`) as above. For a bind mount, `sudo chown 65532:65532 /path/on/host` first.
- **No password in the log.** It is printed only on the very first start of a new database. Run `trail reset-password` (see [above](#first-login-and-adding-a-site)) or set `TRAIL_PASSWORD`.
- **Caddy cannot get a certificate.** Check that the domain's DNS points at this server and that ports 80 and 443 are open in the firewall and the cloud provider's security group: `docker compose logs caddy` says which.
- **Signed out after every restart.** You set `TRAIL_SECRET` to a value that changes on each start. Unset it, or fix it to one value.
- **Every visit has the same country, or is rate limited together.** Your proxy's IP is not trusted, so Trail sees the proxy instead of the visitor. See [Reverse proxies](#reverse-proxies-and-the-visitor-ip).
- **The container is `unhealthy`.** `docker logs trail` shows why the server stopped answering; `docker exec trail /trail health` checks it by hand.
- **Events do not show up.** Work through [Troubleshooting](site/docs/operations/troubleshooting.md): it covers the script tag, status codes and allowed origins.

## Other platforms

These run the same image with a volume mounted at `/data`; there are no one-click templates yet.

- **Fly.io:** copy [`fly.toml.example`](fly.toml.example) to `fly.toml`, then `fly launch --no-deploy --copy-config && fly volumes create trail_data --size 1 && fly deploy`. See [Fly.io](site/docs/install/fly.md).
- **Railway, Render, Coolify, Dokploy:** deploy the image `ghcr.io/karanjot786/trail`, attach a persistent volume at `/data`, expose port 8080, and read the generated password from the logs.
