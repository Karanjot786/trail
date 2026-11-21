---
title: Geo database
description: Countries work out of the box from the built-in DB-IP Lite Country database. Add region and city with TRAIL_GEO_DB.
---

# Geo database

Trail looks up the visitor's location from the request IP, in memory, then drops the IP. The IP is never stored and never sent to a third party.

## Countries: built in

Countries work with no setup. The Trail binary embeds the DB-IP Lite Country database (about 8.5 MB), so a fresh install shows countries from the first visit.

**Settings → Config** shows the database in use and the month it was built, for example `Countries, built in (2026-11)`. `GET /api/config` returns the same as `"geo": {"source": "embedded-country", "build": "2026-11"}`.

The built-in file is refreshed each month in the Trail repository. Upgrade Trail to get the newer edition.

## Region and city: optional

For region and city, point Trail at a City database of your own. It replaces the built-in one.

1. Download `dbip-city-lite-YYYY-MM.mmdb.gz` from [db-ip.com/db/lite.php](https://db-ip.com/db/lite.php) and unzip it (about 130 MB).
2. Put it on the server, for example `/var/lib/trail/dbip-city-lite.mmdb`.
3. Set `TRAIL_GEO_DB` to that path and restart Trail.

Settings → Config then reads `Your database (YYYY-MM)` and `/api/config` reports `"source": "custom"`. Trail refuses to start if `TRAIL_GEO_DB` points at a file it cannot open, so a typo does not silently turn cities off.

The file is opened once at startup. To refresh it, replace the file and restart. DB-IP publishes a new edition each month.

## Privacy modes

Visitors in private mode, and visitors who have not given or have refused consent, get country only. Region and city are dropped even when `TRAIL_GEO_DB` is set.

## Attribution

DB-IP Lite is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), which requires a credit where the data is shown. Trail shows "IP geolocation by DB-IP" with a link to [db-ip.com](https://db-ip.com) in Settings → Config, and lists the database in its `NOTICE` file. If you show Trail's location data elsewhere, credit DB-IP there too.

## Next

- Set `TRAIL_GEO_DB` and other options in [Configuration](/operations/configuration).
- Countries still empty? See [Troubleshooting](/operations/troubleshooting).
