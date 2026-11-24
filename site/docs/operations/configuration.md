---
title: Configuration
description: Every environment variable the Trail server reads, plus allowed origins, trusted proxies and Cloudflare, AI agent lists, the ingest rate limit, environments and the trail commands.
---

# Configuration

Trail reads its settings from the environment at startup. Nothing is stored in a config file. Sites are the exception: they live in the database and you manage them in **Settings** in the dashboard.

| Variable | Default | What it does |
|---|---|---|
| `TRAIL_PASSWORD` | generated | Password for the dashboard. When unset, Trail generates one on the first start of a new database, prints it once in the log (`Log in with: ...`) and stores only its SHA-256. `trail reset-password` makes a new one. A set `TRAIL_PASSWORD` always wins |
| `TRAIL_SITES` | empty | Optional comma list of `id=domain`, e.g. `blog=example.com,docs=docs.example.com`. Each entry is added at startup if the database lacks it; sites you edited in the dashboard keep their edits. You can add sites in Settings instead. Events for ids that are not registered are rejected. The domain decides the environment tag (below) |
| `TRAIL_DB` | `trail.db` (`/data/trail.db` in the Docker image) | Path of the SQLite file |
| `TRAIL_ADDR` | `:8080` | Listen address. Use `127.0.0.1:8080` behind a local proxy |
| `TRAIL_TZ` | `UTC` | IANA timezone for daily buckets and the private-mode key rotation. The dashboard shows days in this zone. install.sh writes the server's own zone. A name Trail does not know stops the server at start |
| `TRAIL_SECRET` | stored in the database | Signs dashboard session cookies. At least 32 characters. When unset, a random key is created on first start and kept in the database, so logins survive restarts with no setup. Set it only to share one key between databases or to rotate it |
| `TRAIL_GEO_DB` | unset | Path to your own City `.mmdb`, such as GeoLite2 City, for region and city. Without it, the built-in database gives country only. See [Geo database](/operations/geo) |
| `TRAIL_API_TOKENS` | unset | Comma list of `name:token:scope` for the [read API and MCP](/api/tokens). Scope is `read` or `write`; tokens shorter than 24 characters stop the server at startup |
| `TRAIL_INGEST_RPS` | `50` | Requests per second per client IP on `/_t/e`, with a burst of twice that. Over the limit is `429`. `0` turns the limit off. See [Rate limit](#rate-limit) |
| `TRAIL_TRUSTED_PROXIES` | `private,cloudflare` | Which proxies may tell Trail the visitor IP. See [Client IP and proxies](#client-ip) |
| `TRAIL_AGENT_LISTS` | unset | `off` stops Trail fetching the published AI agent IP lists and signature keys, so agents are recognised by user agent only. Any other value stops the server at startup. See [AI agent lists](#ai-agent-lists) |
| `TRAIL_DEMO` | unset | `1` serves a read-only demo with generated data at `/demo` |

## Allowed origins

The ingest endpoint `/_t/e` accepts events for a site only from a browser page on an allowed host. Trail reads the `Origin` header, or the host of the `Referer` when there is no `Origin`, and allows:

- the site's domain and any subdomain of it: `example.com` and `www.example.com`, but not `evil-example.com`;
- each entry in the site's allowed origins: an exact host such as `staging.example.org`, `*.example.org` for every subdomain, or a suffix pattern for preview deployments (below). A site can have up to 20;
- `localhost`, `127.0.0.1` and `[::1]`, so local development works.

Preview deployments get a new host per branch or commit, so allow them with a pattern:

| Host | Pattern |
|---|---|
| Vercel previews (`myapp-git-fix-acme.vercel.app`) | `*-acme.vercel.app`, where `acme` is your team's slug |
| Netlify deploy previews (`deploy-preview-12--mysite.netlify.app`) | `*--mysite.netlify.app` |

A `*-` pattern must end in a host of at least three labels, so it can never cover a whole registrable domain. The Install panel suggests the Vercel pattern when it sees a refused `*.vercel.app` host.

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

## Cloudflare {#cloudflare}

Trail trusts Cloudflare's headers only when the request reached it from an address in Cloudflare's published ranges, and only while `cloudflare` is in `TRAIL_TRUSTED_PROXIES` (it is by default). From anywhere else, these headers are ignored, however they are spelled:

| Header | Used for |
|---|---|
| `CF-Connecting-IP` | The visitor IP |
| `CF-IPCountry` | The country. `XX` (unknown) and `T1` (Tor) are ignored |
| `CF-Region-Code`, `CF-IPCity` | Region and city. Cloudflare sends them when its visitor location headers are turned on |

A field Cloudflare leaves empty falls back to the [geo database](/operations/geo). A missing or invalid country drops the region and city too. Private-mode visitors keep the country only.

The ranges are bundled in the binary, not fetched. They change rarely. Each release bundles the current list; to refresh it in a source build, run `make cloudflare-ips` and rebuild.

## AI agent lists

To mark an AI agent as Verified (see [AI visibility](/dashboard/ai-visibility#verified-and-claimed)), Trail downloads the agent operators' published IP lists and Web Bot Auth key directories. It keeps them in memory, refreshes them about every 24 hours, and retries 15 minutes after a failure. Ingest never waits for a download: a request is classified with whatever is cached at that moment.

Trail fetches only these fixed URLs, over HTTPS, with a 10 second timeout, a 2 MiB body limit and at most 3 redirects on the same host. It never fetches a URL taken from a request.

| List | URL |
|---|---|
| Anthropic agents | `https://claude.com/.well-known/sail` |
| Google agents | `https://developers.google.com/static/crawling/ipranges/user-triggered-agents.json` |
| OpenAI crawlers | `https://openai.com/gptbot.json`, `https://openai.com/searchbot.json`, `https://openai.com/chatgpt-user.json`, `https://openai.com/adsbot.json` |
| Perplexity crawlers | `https://www.perplexity.ai/perplexitybot.json`, `https://www.perplexity.ai/perplexity-user.json` |
| OpenAI signature keys | `https://chatgpt.com/.well-known/http-message-signatures-directory` |
| Google signature keys | `https://agent.bot.goog/.well-known/http-message-signatures-directory` |

So the outbound hosts are `claude.com`, `developers.google.com`, `openai.com`, `www.perplexity.ai`, `chatgpt.com` and `agent.bot.goog`. Allow these on your firewall, or turn the downloads off:

```sh
TRAIL_AGENT_LISTS=off
```

With the lists off, agents are still recognised, but by user agent only, and the dashboard shows them as Claimed. The AI visibility method note says "Lists unavailable". Crawler requests are no longer checked against the crawler IP lists either. The log says `agents: TRAIL_AGENT_LISTS=off` at startup.

## Rate limit

`/_t/e` is open to the internet, so Trail limits each client IP to `TRAIL_INGEST_RPS` requests per second (default 50), with a burst of twice that. A request over the limit gets `429` with `Retry-After: 1`, and the tracker retries it with backoff. Set `0` to turn the limit off.

- The client IP comes from [Client IP and proxies](#client-ip): forwarding headers count only from a trusted proxy, so a client cannot dodge its bucket by sending a new `X-Forwarded-For` each time. Behind a proxy, make sure it forwards the visitor's address and is trusted. If not, every visitor looks like one IP and shares one bucket.
- Trail keeps one bucket per IP, keyed by a hash under a random per-process key, so it never holds a raw IP. An IPv6 visitor is keyed by its /64 network, because one device can use any address in it; all of a household's addresses share one bucket. It tracks up to 100,000 IPs at once and forgets buckets that have refilled.
- When the table is full of busy clients, any new IP shares one overflow bucket with 20 times the rate of a single IP. A flood of fresh addresses stays capped instead of getting through unlimited.

The default suits most sites: one visitor sends a few requests per page. Raise it only if a shared office or proxy address sends more than 50 requests a second.

## Environments

Every event carries an environment. If the script sets `data-env`, that value is used. Otherwise the server derives it from the page's host:

| Page host | Environment |
|---|---|
| `localhost`, `*.localhost`, `*.local`, a private or loopback IP | `development` |
| The domain of the site (a leading `www.` is ignored) | `production` |
| A subdomain of the site's domain, such as `app.example.com` | `production`, unless a label in front of the domain looks like staging |
| Anything else, such as a preview deployment URL | `preview` |

The staging labels are `staging`, `stage`, `preview`, `dev`, `test`, `qa`, `uat` and `sandbox`, and any label starting with `pr-`, `preview-` or `staging-`. So `staging.example.com` and `pr-42.app.example.com` are `preview`, while `app.example.com` and `eu.example.com` are `production`. If the site's domain is empty, everything that is not local is `preview`. Set `data-env` on the tag to override any of it.

The dashboard and the API show `production` unless you choose another environment.

## Commands

```sh
trail            # same as trail serve
trail serve      # run the server
trail seed       # fill TRAIL_DB with ~30 days of generated data, for trying the dashboard
trail crawlers import --site ID [--format combined|caddy] [--since auto|RFC3339] [--url URL --token T] FILE|-
                 # import AI crawler requests from an access log, see AI crawlers
trail health     # exit 0 if the server on TRAIL_ADDR answers /healthz (the Docker health check)
trail reset-password  # replace the generated dashboard password in TRAIL_DB and print it; restart afterwards
trail version    # print the version
```

In Docker, run them with `docker exec trail /trail <command>`.

`GET /healthz` answers `200 ok` without a login when the server and its database respond, and `503` when the database does not. Point uptime monitors and load balancers at it.

`trail seed` uses the ids in `TRAIL_SITES`, or `demo` and `docs` when it is empty. It writes events only, so add the same ids in Settings (or `TRAIL_SITES`) to see them in the dashboard. Do not run it against a production database.

## Next

- Run Trail under [Docker](/install/docker) or a [binary with systemd](/install/binary).
- Create [API tokens](/api/tokens).
- Capture [AI crawlers](/add/ai-crawlers).
- Keep the data safe with [Backups](/operations/backups).
