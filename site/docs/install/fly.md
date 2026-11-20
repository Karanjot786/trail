---
title: Fly.io
description: Deploy Trail to one Fly.io machine with a volume for the database.
---

# Fly.io

The repository includes `fly.toml.example`. It builds from the `Dockerfile`, mounts a volume at `/data`, forces HTTPS and keeps one machine running.

```sh
git clone https://github.com/karanjot786/trail && cd trail
cp fly.toml.example fly.toml          # then set `app` to your app name
fly launch --no-deploy --copy-config
fly volumes create trail_data --size 1
fly secrets set TRAIL_PASSWORD=change-me TRAIL_SITES=mysite=example.com
fly secrets set TRAIL_SECRET=$(openssl rand -hex 32)   # 32+ chars, keeps logins across restarts
fly deploy
```

Open `https://<app>.fly.dev` and sign in with `TRAIL_PASSWORD`. If you skipped `TRAIL_SITES`, add your site under **Settings → Add site**.

## What the example config sets

| Key | Value | Why |
|---|---|---|
| `[env] TRAIL_DB` | `/data/trail.db` | The file lives on the volume |
| `[env] TRAIL_TZ` | `Asia/Kolkata` | Change it to your timezone for daily buckets |
| `[mounts]` | `trail_data` → `/data` | One volume, one machine |
| `auto_stop_machines` | `off` | Ingest must answer at any time |
| `min_machines_running` | `1` | |
| `[[vm]] memory` | `256mb` | |

Run exactly one machine. SQLite is a local file, so a second machine would have its own separate database.

## Backups

Fly takes daily volume snapshots. For a copy you control, see [Backups](/operations/backups); on Fly run the commands through `fly ssh console`.
