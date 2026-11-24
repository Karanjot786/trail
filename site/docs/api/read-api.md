---
title: Read API
description: Query your stats over HTTP with a bearer token.
---

# Read API

Every report the dashboard shows is also available under `/api/v1/`, with the same JSON, behind an [API token](/api/tokens).

```sh
export TRAIL=https://stats.example.com TOKEN=your-read-token
curl -H "Authorization: Bearer $TOKEN" "$TRAIL/api/v1/stats?site=mysite&env=all"
```

```json
{"visitors":1,"pageviews":1,"bounce":1,"prev":{"visitors":0,"pageviews":0,"bounce":0},"online":1}
```

## Common parameters

| Parameter | Default | Meaning |
|---|---|---|
| `site` | required | A site id from Settings (or `TRAIL_SITES`). `site=all` is accepted only by `/api/v1/sites/summary` |
| `from`, `to` | the last 24 hours | Unix time in milliseconds. At most 400 days apart |
| `env` | `production` | `production`, `preview`, `development` or `all` |
| `tz` | the server's `TRAIL_TZ` | IANA zone for day boundaries, such as `Europe/Berlin`. An unknown name is a `400` |
| `f` | none | Filter as `dim:value`, repeatable: `f=country:IN&f=device:mobile` |

Filter and breakdown dimensions: `path`, `route`, `host`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `country`, `device`, `browser`, `os`, `event`.

A bad parameter returns `400` with a plain-text reason.

## Routes

| Route | Extra parameters | Returns |
|---|---|---|
| `GET /api/v1/sites` | none | `[{id, domain, origins, created, lastEventAt, events24h}]` |
| `GET /api/v1/stats` | | `{visitors, pageviews, bounce, prev:{...}, online}`. `bounce` is 0 to 1; `prev` is the previous range of the same length |
| `GET /api/v1/series` | `metric` = `visitors`, `pageviews` or `bounce` | `{bucket, points:[{t, v}]}`, hourly or daily |
| `GET /api/v1/breakdown` | `dim`, optional `q` (substring) and `limit` (default 100, max 1000) | `[{key, visitors, pageviews, total}]`. `total` is filled for `dim=event` |
| `GET /api/v1/visitors` | optional `q` and `limit` | `[{person, identified, firstSeen, lastSeen, visits, country, device, source}]` |
| `GET /api/v1/journey` | `person` | That person's sessions, newest first, each with `{sessionId, start, source, steps:[{ts, type, path, name, engagedMs, scrollPct, props}]}` |
| `GET /api/v1/goals` | | `[{id, name, kind, match}]` |
| `GET /api/v1/goals/report` | | `[{id, name, kind, match, conversions, visitors, rate, prev:{...}}]` |
| `GET /api/v1/delivery` | | `{events, retried, retriedRate}` |
| `POST /api/v1/goals` | JSON `{site, name, kind, match}`; write token | `201` with the goal |
| `DELETE /api/v1/goals/{id}?site=` | write token | `204` |

The site routes are in the next section.

## Sites

These are the routes behind **Settings** in the dashboard. `GET` works with a read token. Everything that changes a site needs a `write` token, and a read token gets `403`.

| Route | Body or parameters | Returns |
|---|---|---|
| `GET /api/v1/sites` | none | `[{id, domain, origins, created, lastEventAt, events24h}]`. `created` and `lastEventAt` are Unix ms, and `lastEventAt` is `null` before the first event |
| `POST /api/v1/sites` | JSON `{id, domain, origins?}` | `201` with the site. `400` for a bad id, domain or origin, and `409` if the id exists |
| `PATCH /api/v1/sites/{id}` | JSON `{domain?, origins?}`. The id cannot change | `200` with the site, or `404` |
| `DELETE /api/v1/sites/{id}` | `?purge=1` also deletes the site's events, goals and identities. `?purge=0` (the default) keeps them | `204`, or `404`. Any other `purge` value is `400` |
| `GET /api/v1/sites/{id}/status` | none | `{lastEventAt, events24h, rejected24h}`, or `404` |

- `id` is 1 to 40 characters: lowercase letters, digits and dashes, starting with a letter or digit.
- `domain` is a bare hostname such as `example.com`, with no scheme, path or port. Trail lowercases it.
- `origins` is a list of up to 20 extra hosts allowed to send events, each a hostname or a wildcard like `*.example.com`. The site's own domain and its subdomains are always allowed. See [Allowed origins](/operations/configuration#allowed-origins).
- Bodies must be `application/json` (anything else is `415`), and unknown fields are `400`.
- Deleting without `purge` stops ingest at once. The data stays, so adding the same id again brings it back.
- `rejected24h` counts events refused with a `403` because they came from a host that is not allowed. It is kept in memory for about the last 24 hours and resets when the server restarts. The dashboard's live check polls this route.

Add a site and then check it:

```sh
curl -X POST -H "Authorization: Bearer $WRITE_TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"blog","domain":"example.com","origins":["*.vercel.app"]}' \
  "$TRAIL/api/v1/sites"

curl -H "Authorization: Bearer $TOKEN" "$TRAIL/api/v1/sites/blog/status"
```

```json
{"lastEventAt":null,"events24h":0,"rejected24h":0}
```

## Examples

Top pages for the last 7 days:

```sh
now=$(date +%s000); week=$((now - 7*24*3600*1000))
curl -H "Authorization: Bearer $TOKEN" \
  "$TRAIL/api/v1/breakdown?site=mysite&dim=path&limit=10&from=$week&to=$now"
```

```json
[{"key":"/index.html","visitors":1,"pageviews":1,"total":0}]
```

Create a goal (needs a `write` token):

```sh
curl -X POST -H "Authorization: Bearer $WRITE_TOKEN" -H "Content-Type: application/json" \
  -d '{"site":"mysite","name":"Signed up","kind":"event","match":"Signup"}' \
  "$TRAIL/api/v1/goals"
```

## Next

- Create a [token](/api/tokens).
- Ask an assistant instead: [MCP](/api/mcp).
