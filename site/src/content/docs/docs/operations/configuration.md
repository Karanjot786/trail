---
title: Configuration
description: Every environment variable the Trail server reads.
sidebar:
  order: 1
---

Trail reads its settings from the environment at startup. Nothing is stored in a config file.

| Variable | Default | What it does |
|---|---|---|
| `TRAIL_PASSWORD` | required | Password for the dashboard. The server exits if it is empty |
| `TRAIL_SITES` | empty | Comma list of `id=domain`, e.g. `blog=example.com,docs=docs.example.com`. Events for ids not listed are rejected. The domain decides the environment tag (below) |
| `TRAIL_DB` | `trail.db` (`/data/trail.db` in the Docker image) | Path of the SQLite file |
| `TRAIL_ADDR` | `:8080` | Listen address. Use `127.0.0.1:8080` behind a local proxy |
| `TRAIL_TZ` | `Asia/Kolkata` | IANA timezone for daily buckets and the private-mode key rotation |
| `TRAIL_SECRET` | random per start | Signs dashboard session cookies. At least 32 characters. Set it so logins survive restarts: `openssl rand -hex 32` |
| `TRAIL_GEO_DB` | unset | Path to a DB-IP Lite City `.mmdb` file. Without it, country is empty. See [Geo database](/docs/operations/geo/) |
| `TRAIL_API_TOKENS` | unset | Comma list of `name:token:scope` for the [read API and MCP](/docs/api/tokens/). Scope is `read` or `write`; tokens shorter than 24 characters stop the server at startup |
| `TRAIL_DEMO` | unset | `1` serves a read-only demo with generated data at `/demo` |

## Environments

Every event carries an environment. If the script sets `data-env`, that value is used. Otherwise the server derives it from the page's host:

| Page host | Environment |
|---|---|
| `localhost`, `*.localhost`, `*.local`, a private or loopback IP | `development` |
| The domain listed for the site in `TRAIL_SITES` (a leading `www.` is ignored) | `production` |
| Anything else, such as a preview deployment URL | `preview` |

The dashboard and the API show `production` unless you choose another environment.

## Commands

```sh
trail            # same as trail serve
trail serve      # run the server
trail seed       # fill TRAIL_DB with ~30 days of generated data, for trying the dashboard
```

`trail seed` uses the ids in `TRAIL_SITES`, or `demo` and `docs` when it is empty. Do not run it against a production database.
