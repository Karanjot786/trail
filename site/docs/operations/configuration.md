---
title: Configuration
description: Every environment variable the Trail server reads, plus allowed origins, trusted proxies, the ingest rate limit, environments and the trail commands.
---

# Configuration

Trail reads its settings from the environment at startup. Nothing is stored in a config file. Sites are the exception: they live in the database and you manage them in **Settings** in the dashboard.

| Variable | Default | What it does |
|---|---|---|
| `TRAIL_PASSWORD` | required | Password for the dashboard. The server exits if it is empty |
| `TRAIL_SITES` | empty | Optional comma list of `id=domain`, e.g. `blog=example.com,docs=docs.example.com`. Each entry is added at startup if the database lacks it; sites you edited in the dashboard keep their edits. You can add sites in Settings instead. Events for ids that are not registered are rejected. The domain decides the environment tag (below) |
| `TRAIL_DB` | `trail.db` (`/data/trail.db` in the Docker image) | Path of the SQLite file |
| `TRAIL_ADDR` | `:8080` | Listen address. Use `127.0.0.1:8080` behind a local proxy |
| `TRAIL_TZ` | `Asia/Kolkata` | IANA timezone for daily buckets and the private-mode key rotation |
| `TRAIL_SECRET` | random per start | Signs dashboard session cookies. At least 32 characters. Set it so logins survive restarts: `openssl rand -hex 32` |
| `TRAIL_GEO_DB` | unset | Path to your own City `.mmdb`, such as DB-IP Lite City, for region and city. Without it, the built-in database gives country only. See [Geo database](/operations/geo) |
| `TRAIL_API_TOKENS` | unset | Comma list of `name:token:scope` for the [read API and MCP](/api/tokens). Scope is `read` or `write`; tokens shorter than 24 characters stop the server at startup |
| `TRAIL_INGEST_RPS` | `50` | Requests per second per client IP on `/_t/e`, with a burst of twice that. Over the limit is `429`. `0` turns the limit off. See [Rate limit](#rate-limit) |
| `TRAIL_TRUSTED_PROXIES` | `private,cloudflare` | Which proxies may tell Trail the visitor IP. See [Client IP and proxies](#client-ip) |
| `TRAIL_DEMO` | unset | `1` serves a read-only demo with generated data at `/demo` |

## Allowed origins

The ingest endpoint `/_t/e` accepts events for a site only from a browser page on an allowed host. Trail reads the `Origin` header, or the host of the `Referer` when there is no `Origin`, and allows:

- the site's domain and any subdomain of it: `example.com` and `www.example.com`, but not `evil-example.com`;
- each entry in the site's allowed origins: an exact host such as `staging.example.org`, or a wildcard such as `*.vercel.app` for every subdomain of `vercel.app`. A site can have up to 20;
- `localhost`, `127.0.0.1` and `[::1]`, so local development works.

Anything else gets an empty `403`. A request with neither `Origin` nor `Referer` is refused too, so a bare `curl` needs an `Origin` header to get through. The tracker does not retry a `403`; it drops the events.

Each refused event is counted per site. The Settings live check shows the count with a warning, and `GET /api/v1/sites/{id}/status` returns it as `rejected24h`. The count lives in memory, covers about the last 24 hours, and resets on restart.

A `/_t/*` rewrite on your own domain keeps working, because the browser sends your domain as the `Origin`. Edit a site's list in **Settings**, under the `...` menu, **Allowed origins**, or with `PATCH /api/v1/sites/{id}` (see the [Read API](/api/read-api#sites)).

## Client IP and proxies {#client-ip}

Trail uses the visitor IP for the rate limit, the country lookup and the private-mode visitor key. It never stores the IP.

`X-Forwarded-For` and `CF-Connecting-IP` are plain request headers, so anyone can send them. Trail believes them only when the connection comes from a proxy you trust, set with `TRAIL_TRUSTED_PROXIES`:

| Value | Trusted peers |
|---|---|
| unset | Same as `private,cloudflare` |
| `private` | Loopback and private ranges: `127.0.0.0/8`, `::1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7` |
| `cloudflare` | Cloudflare's published ranges, bundled in the binary |
| an IP or CIDR | That address or range, such as `203.0.113.10` or `2001:db8::/32` |
| `none` | Nobody. The connection's own address is always the client |

Combine entries with commas, e.g. `private,198.51.100.0/24`. A list replaces the default, so add `private` or `cloudflare` back if you still need them. A bad entry stops the server at startup.

How Trail picks the IP:

1. Start at the connection's address. If it is not trusted, that is the client, whatever the headers say.
2. If it is trusted, step to the rightmost `X-Forwarded-For` entry, the one that proxy added. Keep stepping left past trusted addresses. The first untrusted one is the client. Trail never takes the leftmost entry on trust, since the visitor can put anything there.
3. If the hop that delivered the request is a Cloudflare address (and `cloudflare` is trusted), Trail uses `CF-Connecting-IP`, which Cloudflare always overwrites.

Entries may carry a port (`203.0.113.5:443`, `[2001:db8::5]:443`). An entry that is not an IP stops the walk at the last good hop. `X-Real-IP` is ignored.

Common setups:

- **nginx or Caddy on the same machine or LAN.** Works with the default. Caddy sets `X-Forwarded-For` for you; in nginx use `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Bind Trail to `127.0.0.1:8080` so nobody reaches it around the proxy.
- **Cloudflare in front of Trail.** Works with the default, directly or through a local nginx or Caddy. Trail uses `CF-Connecting-IP` only when the request reached it from a Cloudflare address.
- **Docker.** The proxy reaches the container from a private bridge address, so the default works. A port published straight to the internet is not trusted, so a visitor's own header is ignored.
- **Fly.io.** Fly's proxy connects from a private address, so the default works.
- **A load balancer with a public address.** Add its IP or range, e.g. `TRAIL_TRUSTED_PROXIES=private,198.51.100.0/24`.
- **A `/_t/*` rewrite on Vercel or Netlify.** Their requests come from public addresses that change, so Trail sees their edge IP, not the visitor's: countries are wrong and visitors share one rate-limit bucket. If you accept that anyone could then send a forged header, trust every peer with `TRAIL_TRUSTED_PROXIES=0.0.0.0/0,::/0`. See [Rewrites](/install/rewrites#forward-the-visitor-ip).

A visitor on a trusted private network can still write their own `X-Forwarded-For`, since their address is trusted. If that matters, list only your proxy's address instead of `private`.

Cloudflare's ranges change rarely. Each release bundles the current list; to refresh it in a source build, run `make cloudflare-ips` and rebuild.

## Rate limit

`/_t/e` is open to the internet, so Trail limits each client IP to `TRAIL_INGEST_RPS` requests per second (default 50), with a burst of twice that. A request over the limit gets `429` with `Retry-After: 1`, and the tracker retries it with backoff. Set `0` to turn the limit off.

- The client IP comes from [Client IP and proxies](#client-ip): forwarding headers count only from a trusted proxy, so a client cannot dodge its bucket by sending a new `X-Forwarded-For` each time. Behind a proxy, make sure it forwards the visitor's address and is trusted. If not, every visitor looks like one IP and shares one bucket.
- Trail keeps one bucket per IP, keyed by a hash under a random per-process key, so it never holds a raw IP. It tracks up to 100,000 IPs at once and forgets buckets that have refilled.
- When the table is full of busy clients, any new IP shares one overflow bucket with 20 times the rate of a single IP. A flood of fresh addresses stays capped instead of getting through unlimited.

The default suits most sites: one visitor sends a few requests per page. Raise it only if a shared office or proxy address sends more than 50 requests a second.

## Environments

Every event carries an environment. If the script sets `data-env`, that value is used. Otherwise the server derives it from the page's host:

| Page host | Environment |
|---|---|
| `localhost`, `*.localhost`, `*.local`, a private or loopback IP | `development` |
| The domain of the site (a leading `www.` is ignored) | `production` |
| Anything else, such as a preview deployment URL | `preview` |

The dashboard and the API show `production` unless you choose another environment.

## Commands

```sh
trail            # same as trail serve
trail serve      # run the server
trail seed       # fill TRAIL_DB with ~30 days of generated data, for trying the dashboard
```

`trail seed` uses the ids in `TRAIL_SITES`, or `demo` and `docs` when it is empty. It writes events only, so add the same ids in Settings (or `TRAIL_SITES`) to see them in the dashboard. Do not run it against a production database.

## Next

- Run Trail under [Docker](/install/docker) or a [binary with systemd](/install/binary).
- Create [API tokens](/api/tokens).
- Keep the data safe with [Backups](/operations/backups).
