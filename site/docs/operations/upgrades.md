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

## Next

- Check the [changelog](/changelog) for what changed.
- If events stop after the upgrade, see [Troubleshooting](/operations/troubleshooting).
