---
title: Read API
description: Query your stats over HTTP with a bearer token.
sidebar:
  order: 1
---

Every report the dashboard shows is also available under `/api/v1/`, with the same JSON, behind an [API token](/docs/api/tokens/).

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
| `site` | required | Site id from `TRAIL_SITES` |
| `from`, `to` | the last 24 hours | Unix time in milliseconds. At most 400 days apart |
| `env` | `production` | `production`, `preview`, `development` or `all` |
| `f` | none | Filter as `dim:value`, repeatable: `f=country:IN&f=device:mobile` |

Filter and breakdown dimensions: `path`, `route`, `host`, `referrer`, `utm_source`, `utm_medium`, `utm_campaign`, `country`, `device`, `browser`, `os`, `event`.

A bad parameter returns `400` with a plain-text reason.

## Routes

| Route | Extra parameters | Returns |
|---|---|---|
| `GET /api/v1/sites` | none | `[{id, domain}]` |
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
