---
title: Upgrades
description: Move to a new Trail version without losing data.
sidebar:
  order: 4
---

An upgrade is a new binary or image over the same SQLite file. Schema changes run at startup: missing tables are created and missing columns added, so there are no migrations to run by hand.

1. [Back up](/docs/operations/backups/) the database.
2. Pull the new code and rebuild.

   ```sh
   git pull
   make build                 # the binary
   docker build -t trail .    # or the image
   ```

3. Restart: `systemctl restart trail`, `docker compose up -d --build`, or `fly deploy`.

The tracker files are embedded in the binary, so sites that load `/_t/t.js` get the new tracker as soon as the server restarts. They are served with `Cache-Control: public, max-age=3600`, so browsers pick them up within an hour.

Read the [changelog](/docs/changelog/) before upgrading.
