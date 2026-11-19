# Trail

Self-hosted web analytics for your own sites. One Go binary, SQLite storage, an embedded React dashboard and a tracker script under 2 KB gzipped.

## Features

- Pageviews (including SPA `pushState` and back/forward), referrers, UTM, country, device, browser, OS
- Custom events, `identify` / `reset`, JS errors, outbound clicks, form submits
- Opt-in web vitals and rage clicks
- Per-visitor journey: source, pages in order, time on page, scroll depth, return visits, signup point
- Honest bounce rate, live "online" count, previous-period comparison
- Multiple sites, one password, no cookies banner dependencies, no raw IPs stored

## Quick start

Docker:

```sh
docker build -t trail .
docker run -d --name trail -p 8080:8080 -v trail-data:/data \
  -e TRAIL_PASSWORD=change-me \
  -e TRAIL_SITES=mysite=example.com \
  trail
```

Fly.io:

```sh
cp fly.toml.example fly.toml      # set `app`
fly launch --no-deploy --copy-config
fly volumes create trail_data --size 1
fly secrets set TRAIL_PASSWORD=change-me TRAIL_SITES=mysite=example.com
fly deploy
```

Open the host in a browser and log in with `TRAIL_PASSWORD`. Run Trail behind HTTPS (Fly does this for you).

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `TRAIL_PASSWORD` | none, required | Dashboard login password |
| `TRAIL_DB` | `trail.db` (`/data/trail.db` in Docker) | SQLite file path |
| `TRAIL_ADDR` | `:8080` | Listen address |
| `TRAIL_SITES` | empty | `id=domain,id2=domain2`. Events for unknown site ids are rejected |
| `TRAIL_TZ` | `Asia/Kolkata` | Timezone for daily buckets |
| `TRAIL_GEO_DB` | unset | Path to a DB-IP Lite City `.mmdb`. Without it, country is empty |

## Adding Trail to a site

Proxy the tracker through your own domain so it is first-party and not blocked.

Vercel (`vercel.json`):

```json
{"rewrites":[{"source":"/_t/:p*","destination":"https://<trail-host>/_t/:p*"}]}
```

Next.js (`next.config.js`):

```js
module.exports = {
  async rewrites() {
    return [{ source: '/_t/:p*', destination: 'https://<trail-host>/_t/:p*' }];
  },
};
```

Then add the script:

```html
<script defer src="/_t/t.js" data-site="mysite"></script>
```

`data-site` must match an id in `TRAIL_SITES`. The tracker does nothing on `localhost` unless `data-dev` is set.

### Tracker API

```js
trail.track('signup_clicked', { plan: 'pro' }); // custom event, flat props (max 20 keys)
trail.identify(user.id);                         // call on login
trail.reset();                                   // call on logout
trail.pageview({ route: '/blog/[slug]' });       // manual pageview, optional route template
```

Calls made before the script loads are queued if you define `window.trail` as a function and collect arguments in `window.trailq`.

`identify` with a different user on the same device rotates the anonymous id first, so users are never merged by accident.

Script attributes:

| Attribute | Purpose |
|---|---|
| `data-site` | Site id (required) |
| `data-api` | Ingest endpoint, default `/_t/e` |
| `data-env` | Tag events, e.g. `production` or `preview`; the dashboard can filter on it |
| `data-dev` | Also track on `localhost` |
| `data-route` | Default route template for pageviews |
| `data-vitals` | Opt in to web vitals |
| `data-rage` | Opt in to rage-click detection |

## What is tracked

- **Pageviews**, with referrer, UTM and country/device/browser/OS derived server-side from the request
- **Engagement**: visible time on page and scroll depth
- **Events**: custom events, identify, JS errors (max 5 per page), outbound link clicks, form submits
- Bots are stored with a flag and excluded from every dashboard number.

Definitions:

- **Session**: ends after 30 minutes of inactivity, 24-hour hard cap. A new external referrer or new UTM starts a new session. Sessions do not split at midnight.
- **Visitors**: distinct people with at least one non-bot event in the range. A person is the user id from `identify` if there is one, otherwise the anonymous id. Visitors are not reset daily.
- **Engaged session**: 10 s or more of visible time, or 2+ pageviews, or any custom event or identify.
- **Bounce rate**: `1 - engaged sessions / sessions`.
- **Online**: distinct anonymous ids with any event in the last 5 minutes.

## Geo (optional)

Trail reads country from a DB-IP Lite City database. Download `dbip-city-lite-YYYY-MM.mmdb` manually from <https://db-ip.com/db/lite.php>, put it on the server (for example in `/data`) and set `TRAIL_GEO_DB`. Refresh it monthly if you want current data.

The DB-IP Lite database is licensed CC-BY 4.0. You must attribute it, for example: "IP geolocation by DB-IP.com".

## Backups

The database is a single SQLite file. Take consistent snapshots with a cron job on the host:

```sh
0 3 * * * sqlite3 /data/trail.db ".backup /backups/trail-$(date +\%F).db"
```

(`%` must be escaped as `\%` inside crontab.) On Fly, use `fly ssh console` or volume snapshots.

## Privacy

- The raw IP address is never written to disk. It is used in memory for geo and bot checks only.
- The tracker sets a first-party `_t_id` cookie (and a localStorage copy) holding a random id. No third parties are involved.

## Development

Requirements: Go 1.26+, Node 22+, pnpm.

```sh
make build      # tracker, then dashboard, then ./trail (static, CGO_ENABLED=0)
make test       # go test, tracker (Playwright) and dashboard (Vitest) tests
make seed       # fill dev.db with fake data (2 sites, ~30 days)
make dev        # run the server on :8080 with dev.db; `cd web && pnpm dev` for the UI
make clean
```

The tracker is built from `tracker/t.ts` into `internal/ingest/t.js` and embedded in the binary; the dashboard is built into `web/dist` and embedded too.

## License

TBD
