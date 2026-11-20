---
title: Geo database
description: Add country data with the free DB-IP Lite City database.
---

# Geo database

Trail looks up the visitor's country from the request IP, in memory, then drops the IP. It needs a DB-IP Lite City database in `.mmdb` format. Without one, country is left empty and everything else works.

1. Download `dbip-city-lite-YYYY-MM.mmdb.gz` from [db-ip.com/db/lite.php](https://db-ip.com/db/lite.php) and unzip it.
2. Put it on the server, for example `/var/lib/trail/dbip-city-lite.mmdb`.
3. Set `TRAIL_GEO_DB` to that path and restart Trail.

The file is opened once at startup, so to refresh it, replace the file and restart. DB-IP publishes a new edition each month.

## Attribution

DB-IP Lite is licensed under CC BY 4.0, which requires attribution where you show the data. For example: "IP geolocation by DB-IP.com".
