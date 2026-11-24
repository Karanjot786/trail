---
title: Upgrades
description: Upgrade Trail to a new version over the same SQLite file, with no migrations to run by hand.
---

# Upgrades

An upgrade is a new binary or image over the same SQLite file. Schema changes run at startup: missing tables are created and missing columns added, so there are no migrations to run by hand.

1. [Back up](/operations/backups) the database.
2. Get the new version and restart:

   | Install | Update |
   |---|---|
   | Docker | `docker pull ghcr.io/karanjot786/trail`, then `docker rm -f trail` and the same `docker run` as before |
   | Compose | `docker compose pull && docker compose up -d` |
   | Install script | Run the [install command](/install/binary) again. It replaces the binary and restarts `trail.service`, leaving `/etc/trail.env` and the data alone |
   | From source | `git pull && make build`, then `systemctl restart trail` (or `docker build` and recreate the container) |
   | Fly.io | `git pull && fly deploy` |

   Pin a version to choose when you move: `ghcr.io/karanjot786/trail:0.3` (or `:0.3.1`), or `TRAIL_VERSION=v0.3.1` for the install script. `:edge` follows the `main` branch.

The tracker files are embedded in the binary, so sites that load `/_t/t.js` get the new tracker as soon as the server restarts. They are served with `Cache-Control: public, max-age=3600`, so browsers pick them up within an hour.

Read the [changelog](/changelog) before upgrading.

## What an upgrade changes for people

- **Everyone signed in to the dashboard is signed out once.** Session cookies are now bound to the password, so sign in again.
- **IPv6 visitors get a new private id once.** Rate limits and private-mode ids now use the /64 network of an IPv6 address. IPv4 visitors and full-mode visitors keep theirs.
- **`TRAIL_TZ` defaults to `UTC`.** Set it if you rely on another zone for day boundaries; the install script writes the host's zone on a new install. A name Trail does not know stops the server at start.
- **The server no longer sets `_t_id`.** See [the cookie](/tracking/privacy#the-t-id-cookie).
- **The first start folds your history.** A release that stores a visit's engaged time and scroll depth on the pageview row folds your existing engage rows into their pageviews in the background, in small steps, while Trail keeps collecting. Reports read the same numbers during and after.
  - **Backup.** Before the first step Trail copies the database to `<db>.pre-fold` (`VACUUM INTO`), off the collection path. It needs about 1.2 times the database size free in that folder; without it the fold waits and the log says how much. `TRAIL_FOLD_NO_BACKUP=1` skips the copy.
  - **Disk.** Deleted rows leave free space inside the file. Files up to 256 MB are compacted automatically once the fold is done. For a larger file run `trail compact` in a quiet hour; it needs as much free space as the file holds.
  - **Roll back.** Stop Trail, run `trail unfold` (it rewrites the engage rows older binaries read), then start the older binary. Restoring `<db>.pre-fold` also works but loses events collected since.
- **The first start builds new indexes.** This happens at startup, before Trail accepts events, so on a large database the start takes longer once.
- **`trail-analytics` 0.3 proxies answer `503` when `TRAIL_SITE` or `TRAIL_CRAWL_TOKEN` is missing.** Run `npx trail-analytics init` again, or set both variables, then redeploy.

## Next

- Check the [changelog](/changelog) for what changed.
- If events stop after the upgrade, see [Troubleshooting](/operations/troubleshooting).
