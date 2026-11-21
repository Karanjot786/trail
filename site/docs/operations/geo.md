---
title: Geo database
description: Where Trail gets a visitor's location, how accurate each level is, and how to add region and city with TRAIL_GEO_DB.
---

# Geo database

Trail looks up the visitor's location from the request IP, in memory, then drops the IP. The IP is never stored and never sent to a third party.

## Where the location comes from

For each event Trail takes the first source it can trust:

1. **Your edge, through the signed proxy.** The first-party `/t/*` proxy that [`npx trail-analytics init`](/add/ai-crawlers) adds forwards the location your host's edge attached (Vercel, Cloudflare or Netlify), signed with your crawl token. Trail uses it only when the signature checks out.
2. **Cloudflare.** When Trail itself sits behind Cloudflare, it reads `CF-IPCountry`, `CF-Region-Code` and `CF-IPCity`, but only from requests that came from Cloudflare's own addresses. See [Cloudflare](/operations/configuration#cloudflare).
3. **The database**, for the client IP that Trail trusts. Which IP that is depends on `TRAIL_TRUSTED_PROXIES`; see [Client IP and proxies](/operations/configuration#client-ip).

When an edge gives a country but no region or city, Trail fills the gaps from the database, but only if the database agrees on the country. Every event records which source answered.

## How accurate it is

The dashboard labels each level:

| Level | Label | Why |
|---|---|---|
| Country | none | Shown as fact |
| Region | **Regions · approximate** | Approximate, whatever the source |
| City | **Cities · rough estimate** | Often the city of the visitor's network hub, not where they are |

City is the weak level for every source. Mobile networks route through a few hub cities; independent GPS checks put only 20–37% of Indian visitors within 25 km of the city shown, whatever the database. The journey sheet adds "(rough estimate)" after a city, and the Visitors city column carries the same note.

Under the Overview's Location panel a chip names the source that answered most events in the last 24 hours:

| Chip | Source |
|---|---|
| Location: your edge (Vercel) | The signed proxy, with Vercel's location |
| Location: Cloudflare | Cloudflare, through the proxy or in front of Trail |
| Location: Netlify | The signed proxy, with Netlify's location |
| Location: DB-IP Lite (country) | The built-in country database |
| Location: your database | The database, with your `TRAIL_GEO_DB` file |

Trail never shows latitude, longitude or postal codes.

## Countries: built in

Countries work with no setup. The Trail binary embeds the DB-IP Lite Country database (about 8.5 MB), so a fresh install shows countries from the first visit.

**Settings → Config** shows the database in use and the month it was built, for example `Countries, built in (2026-11)`. `GET /api/config` returns the same as `"geo": {"source": "embedded-country", "build": "2026-11"}`.

The built-in file is refreshed each month in the Trail repository. Upgrade Trail to get the newer edition.

## Region and city: optional

For region and city without an edge, point Trail at a City database of your own. It replaces the built-in one.

We recommend **GeoLite2 City** with your own free MaxMind key over DB-IP City: it places about 1.5× more visitors within 25 km in India. Any database's city is still a rough estimate, often the ISP's hub city.

1. Create a free MaxMind account and a license key, then download GeoLite2 City as an `.mmdb` file. Follow MaxMind's license terms for it.
2. Put it on the server, for example `/var/lib/trail/GeoLite2-City.mmdb`.
3. Set `TRAIL_GEO_DB` to that path and restart Trail.

DB-IP Lite City works the same way: download `dbip-city-lite-YYYY-MM.mmdb.gz` from [db-ip.com/db/lite.php](https://db-ip.com/db/lite.php), unzip it (about 130 MB) and point `TRAIL_GEO_DB` at it.

Settings → Config then reads `Your database (YYYY-MM)` and `/api/config` reports `"source": "custom"`. Trail refuses to start if `TRAIL_GEO_DB` points at a file it cannot open, so a typo does not silently turn cities off.

The file is opened once at startup. To refresh it, replace the file and restart. Both databases publish new editions regularly.

## Privacy modes

Visitors in private mode, and visitors who have not given or have refused consent, get country only. Region and city are dropped whatever the source, even when `TRAIL_GEO_DB` is set or an edge sends a city.

## Attribution

DB-IP Lite is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), which requires a credit where the data is shown. Trail shows "IP geolocation by DB-IP" with a link to [db-ip.com](https://db-ip.com) in Settings → Config, and lists the database in its `NOTICE` file. If you show Trail's location data elsewhere, credit DB-IP there too.

## Next

- Set `TRAIL_GEO_DB` and other options in [Configuration](/operations/configuration).
- Get edge locations with the [first-party proxy](/add/ai-crawlers#the-first-party-proxy).
- Check which proxies Trail trusts in [Client IP and proxies](/operations/configuration#client-ip).
- Countries still empty? See [Troubleshooting](/operations/troubleshooting).
