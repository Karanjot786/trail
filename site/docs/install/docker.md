---
title: Docker
description: Run the published Trail image with one command, or with Docker Compose and Caddy for automatic HTTPS.
---

# Docker

The image `ghcr.io/karanjot786/trail` is built for `linux/amd64` and `linux/arm64`. It holds one static binary on a distroless base, runs as a non-root user (uid 65532), keeps its database in `/data`, and has a health check.

| Tag | What it is |
|---|---|
| `latest` | The newest release |
| `0.3`, `0.3.1` | A release line, or one exact release |
| `edge` | The `main` branch, rebuilt on every push |

## One command

```sh
docker run -d --name trail --restart unless-stopped \
  -p 8080:8080 -v trail-data:/data \
  ghcr.io/karanjot786/trail
```

The first start prints a generated dashboard password:

```sh
docker logs trail 2>&1 | grep 'Log in'
```

Open `http://<server>:8080` and log in. To choose the password yourself, add `-e TRAIL_PASSWORD=...`. Other settings are environment variables too, such as `-e TRAIL_TZ=Europe/Berlin` or `-e TRAIL_SITES=mysite=example.com`; see [Configuration](/operations/configuration).

The image sets `TRAIL_DB=/data/trail.db` and `TRAIL_ADDR=:8080`. Use a named volume as above: it takes the ownership of the image's `/data`, so the non-root user can write there. For a bind mount, run `sudo chown 65532:65532 /path/on/host` first.

`docker ps` shows `healthy` once the server answers `/healthz`. You can check it by hand with `docker exec trail /trail health`.

Plain HTTP is fine for a trial. For real sites, serve Trail over HTTPS: use Compose below, or publish the port on `127.0.0.1` only (`-p 127.0.0.1:8080:8080`) and put your own proxy in front (see [HTTPS](#https)).

## Docker Compose with automatic HTTPS {#compose}

[`deploy/compose.yaml`](https://github.com/karanjot786/trail/blob/main/deploy/compose.yaml) runs Trail behind Caddy, which gets and renews a Let's Encrypt certificate by itself. Point the domain's DNS at the server and open ports 80 and 443, then:

```sh
curl -fsSLO https://raw.githubusercontent.com/karanjot786/trail/main/deploy/compose.yaml
echo "DOMAIN=stats.example.com" > .env && docker compose up -d
```

Read the password with `docker compose logs trail | grep 'Log in'` and open `https://stats.example.com`.

Settings can live in a `.env` file next to `compose.yaml`, so later `docker compose` commands pick them up:

::: code-group
```sh [.env]
DOMAIN=stats.example.com
TRAIL_PASSWORD=choose-a-long-one   # optional
TRAIL_TZ=Europe/Berlin             # optional, default UTC
TRAIL_SITES=blog=example.com       # optional
```
:::

Trail's port is not published. Only Caddy reaches it, over the private Compose network, so the visitor IP that Caddy forwards is trusted with the default `TRAIL_TRUSTED_PROXIES`. The data is in the `trail_trail-data` volume.

To test the stack on your own machine, use `DOMAIN=localhost`: Caddy then serves a certificate from its own local authority, which your browser will warn about. `HTTP_PORT` and `HTTPS_PORT` move it off ports 80 and 443.

## HTTPS with your own proxy {#https}

Put Trail behind any reverse proxy that terminates TLS, such as Caddy, nginx or your platform's load balancer. The dashboard cookie is marked `Secure` when the request arrives over TLS or with `X-Forwarded-Proto: https`.

Trail believes `X-Forwarded-For` only from a trusted proxy. By default that is loopback and private addresses, which covers a proxy on the same host or Docker network, plus Cloudflare. A client that connects to port 8080 directly cannot fake its IP, but it can skip the proxy, so publish the port on `127.0.0.1` only. Other setups are in [Client IP and proxies](/operations/configuration#client-ip).

## Build the image yourself

```sh
git clone https://github.com/karanjot786/trail && cd trail
docker build -t trail .
docker run -d --name trail -p 8080:8080 -v trail-data:/data trail
```

The `Dockerfile` builds the tracker and the dashboard with Node, cross-compiles the Go binary for the target platform, and copies it into the distroless image. `docker buildx build --platform linux/amd64,linux/arm64 .` builds both architectures without emulation.

## Geo data

Countries work with no setup: the image carries the built-in DB-IP Lite Country database. For region and city, mount a DB-IP Lite City file and point `TRAIL_GEO_DB` at it. See [Geo database](/operations/geo).

```sh
docker run ... -v /srv/geo:/geo:ro -e TRAIL_GEO_DB=/geo/dbip-city-lite.mmdb ghcr.io/karanjot786/trail
```

## Next

- Serve the tracker from your own domain: [Rewrites](/install/rewrites).
- Back up the volume: [Backups](/operations/backups).
- Open the dashboard and sign in: [First run in the dashboard](/dashboard/first-run) walks you through adding your site.
- Then [add the script tag](/add/script-tag) to your site.
