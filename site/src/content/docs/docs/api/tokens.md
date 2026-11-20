---
title: Keys and tokens
description: The password, session secret and API tokens Trail uses, and what each one can reach.
sidebar:
  order: 3
---

Trail has three kinds of secret. None of them is ever sent to the browser of a visitor.

| Name | Set with | Used for | Can reach |
|---|---|---|---|
| Dashboard password | `TRAIL_PASSWORD` | Signing in to the dashboard | Everything under `/api/*`, through a session cookie |
| Session secret | `TRAIL_SECRET` | Signing the `trail_session` cookie | Nothing by itself. Set it so sessions survive restarts |
| API token | `TRAIL_API_TOKENS` | Scripts, dashboards and AI assistants | `/api/v1/*` and `/mcp`, by scope |

The site id in `data-site` is public by design: it is in your page source. It only decides which site an event belongs to.

## API tokens

```sh
TRAIL_API_TOKENS="laptop:$(openssl rand -hex 24):read,ci:$(openssl rand -hex 24):write"
```

Each entry is `name:token:scope`:

- **name** labels the token. Names must be unique.
- **token** is the secret, at least 24 characters, and different for every entry.
- **scope** is `read` or `write`.

The server refuses to start if an entry is malformed, so a typo never leaves you with an open endpoint. Errors name the entry, never the token value.

| Scope | `GET /api/v1/*` | `POST`/`DELETE /api/v1/goals` | `/mcp` |
|---|---|---|---|
| `read` | yes | no, `403` | yes |
| `write` | yes | yes | yes |

Send the token as a header:

```sh
curl -H "Authorization: Bearer $TOKEN" https://stats.example.com/api/v1/sites
```

A missing or unknown token gets `401`. Each token may make 300 requests a minute; past that the answer is `429` until the bucket refills.

API tokens cannot sign in to the dashboard, and the dashboard password does not work as a bearer token.

## Rotating

Add the new token next to the old one, restart, move your clients over, then remove the old entry and restart again.
