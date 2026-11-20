---
title: Docker
description: Build the Trail image and run it with a volume for the SQLite file.
---

# Docker

The repository ships a three-stage `Dockerfile`: it builds the tracker and the dashboard with Node, compiles a static Go binary, and copies that binary into a distroless image that runs as a non-root user. There is no published image yet, so you build it yourself.

```sh
git clone https://github.com/karanjot786/trail && cd trail
docker build -t trail .
```

Run it with a named volume, because the database lives at `/data/trail.db` inside the container:

```sh
docker run -d --name trail --restart unless-stopped \
  -p 8080:8080 -v trail-data:/data \
  -e TRAIL_PASSWORD=change-me \
  -e TRAIL_SITES=mysite=example.com \
  -e TRAIL_SECRET=$(openssl rand -hex 32) \
  trail
```

The image sets `TRAIL_DB=/data/trail.db` and `TRAIL_ADDR=:8080`. Every other setting is an environment variable; see [Configuration](/operations/configuration).

`TRAIL_SITES` is optional: you can also add sites in the dashboard under **Settings → Add site**, see [Script tag](/add/script-tag#add-a-site).

`TRAIL_SECRET` is optional, but without it the session-signing key is random on every start, so a restart signs you out. It must be at least 32 characters.

Each client IP may send 50 event requests per second to `/_t/e`. Change it with `TRAIL_INGEST_RPS`; see [Rate limit](/operations/configuration#rate-limit).

## Docker Compose

::: code-group
```yaml [compose.yaml]
services:
  trail:
    build: .
    restart: unless-stopped
    ports: ['8080:8080']
    volumes: ['trail-data:/data']
    environment:
      TRAIL_PASSWORD: change-me
      TRAIL_SITES: mysite=example.com
      TRAIL_TZ: Europe/Berlin
volumes:
  trail-data:
```
:::

## HTTPS

Put Trail behind a reverse proxy that terminates TLS, such as Caddy, nginx or your platform's load balancer. The dashboard cookie is marked `Secure` when the request arrives over TLS or with `X-Forwarded-Proto: https`.

Trail reads the visitor IP from the first `X-Forwarded-For` entry when the header is present, so do not expose port 8080 directly to the internet: a client could send its own header. Let the proxy set it.

## Geo data

To get countries, mount a DB-IP Lite City file and point `TRAIL_GEO_DB` at it. See [Geo database](/operations/geo).

```sh
docker run ... -v /srv/geo:/geo:ro -e TRAIL_GEO_DB=/geo/dbip-city-lite.mmdb trail
```

## Next

- Serve the tracker from your own domain: [Rewrites](/install/rewrites).
- Back up the volume: [Backups](/operations/backups).
- Then [add the script tag](/add/script-tag) to your site.
