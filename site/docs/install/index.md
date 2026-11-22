---
title: Self-hosting
description: Run Trail on your own server in one or two commands, with Docker, Docker Compose and automatic HTTPS, or a single binary under systemd.
---

# Self-hosting

Trail is one binary with the dashboard and the tracker inside it, and one SQLite file for the data. No database server, queue or cache. Pick one of three ways to run it; each is one or two commands.

You do not have to set a password or a secret. On the first start of a new database Trail generates a dashboard password, prints it once in the log, and keeps the session-signing key in the database, so logins survive restarts. Set `TRAIL_PASSWORD` if you want to choose your own.

## Docker: one command

```sh
docker run -d --name trail --restart unless-stopped -p 8080:8080 -v trail-data:/data ghcr.io/karanjot786/trail
```

Read the password with `docker logs trail 2>&1 | grep 'Log in'` and open `http://<server>:8080`. Details: [Docker](/install/docker).

## Docker Compose with HTTPS: two commands

Point a domain at the server, open ports 80 and 443, then:

```sh
curl -fsSLO https://raw.githubusercontent.com/karanjot786/trail/main/deploy/compose.yaml
echo "DOMAIN=stats.example.com" > .env && docker compose up -d
```

Caddy gets a Let's Encrypt certificate for the domain and proxies to Trail. Read the password with `docker compose logs trail | grep 'Log in'` and open `https://stats.example.com`. Details: [Docker Compose with HTTPS](/install/docker#compose).

## Binary and systemd: one command, no Docker

```sh
curl -fsSL https://raw.githubusercontent.com/karanjot786/trail/main/install.sh | sh
```

The script downloads the release for your OS and CPU, checks its SHA-256 against the release's `checksums.txt`, installs `/usr/local/bin/trail`, and on Linux with systemd creates a `trail` user, `/var/lib/trail`, `/etc/trail.env` and `trail.service`, starts it and prints the password. Details: [Binary, systemd and Caddy](/install/binary).

## First login {#first-login}

1. Log in with the generated password (or `TRAIL_PASSWORD`).
2. Open **Settings → Add site** and enter your site's domain.
3. Paste the snippet from the site's **Install** panel into its `<head>`. See [Script tag](/add/script-tag).

Lost the generated password? Make a new one, then restart Trail:

::: code-group
```sh [Docker]
docker exec trail /trail reset-password && docker restart trail
```
```sh [Compose]
docker compose exec trail /trail reset-password && docker compose restart trail
```
```sh [systemd]
sudo -u trail env TRAIL_DB=/var/lib/trail/trail.db trail reset-password
sudo systemctl restart trail
```
:::

## What you need

- A Linux server, amd64 or arm64. A small VPS is plenty; a Mac or a Raspberry Pi 4 works too.
- For HTTPS, a domain or subdomain whose DNS points at the server.
- Docker with the Compose plugin for the first two options (`curl -fsSL https://get.docker.com | sh`), or nothing for the binary.

## Other platforms

- [Fly.io](/install/fly) with the bundled `fly.toml.example`.
- Railway, Render, Coolify, Dokploy and similar: deploy the image `ghcr.io/karanjot786/trail`, attach a persistent volume at `/data`, expose port 8080 and read the generated password from the logs.

## Next

- Keep the data safe: [Backups](/operations/backups).
- Move to a new version: [Upgrades](/operations/upgrades).
- Every setting: [Configuration](/operations/configuration).
- The same guide as one page in the repository: [`SELF_HOSTING.md`](https://github.com/karanjot786/trail/blob/main/SELF_HOSTING.md).
