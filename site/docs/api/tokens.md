---
title: Keys and tokens
description: The password, session secret and API tokens Trail uses, and what each one can reach.
---

# Keys and tokens

Trail has three kinds of secret. None of them is ever sent to the browser of a visitor.

| Name | Set with | Used for | Can reach |
|---|---|---|---|
| Dashboard password | `TRAIL_PASSWORD` | Signing in to the dashboard | Everything under `/api/*`, through a session cookie |
| Session secret | `TRAIL_SECRET` | Signing the `trail_session` cookie | Nothing by itself. Set it so sessions survive restarts |
| API token | Settings, or `TRAIL_API_TOKENS` | Scripts, dashboards and AI assistants | `/api/v1/*` and `/mcp`, by scope and site |

The site id in `data-site` is public by design: it is in your page source. It only decides which site an event belongs to, and events are accepted only from the site's [allowed origins](/operations/configuration#allowed-origins).

## API tokens

Make a token in the dashboard, or set it in the environment.

**In the dashboard.** Open **Settings → API tokens** (or **AI assistants**, which makes one for you), choose a name, an access level and a site, and click **Create token**. The secret is shown once. Revoke a token from the same list and it stops working at once.

**In the environment.**

```sh
TRAIL_API_TOKENS="laptop:$(openssl rand -hex 24):read,ci:$(openssl rand -hex 24):write"
```

Each entry is `name:token:scope`:

- **name** labels the token. Names must be unique, and cannot reuse a dashboard token's name.
- **token** is the secret, at least 24 characters, and different for every entry.
- **scope** is `read` or `write`. The `notes` and `crawl` scopes are for dashboard tokens only.

The server refuses to start if an entry is malformed, so a typo never leaves you with an open endpoint. Errors name the entry, never the token value. Environment tokens cover every site and are revoked by removing them and restarting.

### Scopes

| Scope | Dashboard label | `GET /api/v1/*` | `/mcp` | Also allowed |
|---|---|---|---|---|
| `read` | Read stats only | yes | yes | nothing else |
| `notes` | Stats and chart notes | yes | yes | add and delete chart notes at `/api/v1/notes` |
| `write` | Everything in the API | yes | yes | every `POST`, `PATCH` and `DELETE` on `/api/v1/*`: goals, funnels, sites and more |
| `crawl` | Crawler logs only | no | no | `POST /api/v1/crawls`, for [`trail crawlers import`](/add/ai-crawlers) |

Anything else gets `403`.

### Per site

A dashboard token covers **one site** or **all sites, including ones you add later**. A site token cannot read another site: asking for one returns `403`. Give assistants and scripts a read token for the one site they need.

Send the token as a header:

```sh
curl -H "Authorization: Bearer $TOKEN" https://stats.example.com/api/v1/sites
```

A missing or unknown token gets `401`. Each token may make 300 requests a minute; past that the answer is `429` until the bucket refills.

API tokens cannot sign in to the dashboard, and the dashboard password does not work as a bearer token.

## Rotating

Create the new token next to the old one, move your clients over, then revoke the old one in **Settings → API tokens**. For a token set in `TRAIL_API_TOKENS`, add the new entry, restart, move over, then remove the old entry and restart again.

## Next

- Call the [Read API](/api/read-api).
- Connect an assistant over [MCP](/api/mcp).
