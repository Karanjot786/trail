---
title: Troubleshooting
description: 'A step-by-step checklist for when events do not show up: script loading, HTTP status codes, allowed origins, environments and bots.'
---

# Troubleshooting

Work down the list. Most problems turn up in the first four steps.

1. **Is the script loading?** In the browser's network panel, `t.js` must return 200 as `application/javascript`. A 404 usually means the `/_t/*` rewrite is missing or points at the wrong host. The tracker files are served gzipped when the browser accepts it, so `Content-Encoding: gzip` is normal.
2. **Is the tracker running at all?** It does nothing on `localhost`, `127.*` or `[::1]` unless the tag has `data-dev`. It also skips pages that are being prerendered.
3. **Are events accepted?** Look for `POST /_t/e`:

   | Status | Meaning |
   |---|---|
   | `204` with `X-Trail-Accepted: n` | Stored. `X-Trail-Rejected: n` counts events in the batch that were skipped as invalid. The valid ones are kept |
   | `400` | A batch with no valid events, an unknown site id, or a batch with mixed sites. The response body says which |
   | `403` | The page's host is not allowed for this site. The body is empty. See the next step |
   | `413` | Body over 64 KB |
   | `405` | Wrong method. Only `POST` and `OPTIONS` are allowed |
   | `429` | Too many requests from one IP. See [Rate limit](/operations/configuration#rate-limit) |

   "Unknown site" means `data-site` does not match a site id. Open **Settings** in the dashboard to see the ids, or add the site. The server log says "no sites yet" at startup when none exist.
4. **A 403 on `/_t/e`?** The page is on a host the site does not allow. Open the site's Install panel in **Settings**: its live check warns when events were rejected for their origin. Add the host under **Allowed origins** (for example `*.vercel.app` for preview deployments). A request with no `Origin` and no `Referer`, such as a bare `curl`, is refused too. See [Allowed origins](/operations/configuration#allowed-origins).
5. **Accepted, but the charts are empty?** Check the environment picker. Events from a host other than the site's domain are tagged `preview`, `localhost` is `development`, and the dashboard shows `production` by default. See [Environments](/operations/configuration#environments).
6. **Countries empty, or all the same?** Make sure your proxy forwards the client IP in `X-Forwarded-For` and is trusted by `TRAIL_TRUSTED_PROXIES` (see [Client IP and proxies](/operations/configuration#client-ip)); otherwise every visit looks like it comes from the proxy. Settings → Config shows which geo database is in use. Region and city need `TRAIL_GEO_DB`.
7. **Signed out after every restart?** `TRAIL_SECRET` is set to a value that changes on each start. Unset it (Trail then keeps its own key in the database) or fix it to one value of 32 or more characters. Lost the generated password? Run `trail reset-password` and restart; see [Self-hosting](/install/#first-login).
8. **Some visits are missing?** Requests that look automated are stored with a bot flag and left out of every report. That includes browsers driven by Playwright, Puppeteer or Selenium, which set `navigator.webdriver`. Visitors who send Do Not Track or Global Privacy Control are not tracked unless you set `data-dnt="off"`.
9. **Cloudflare Rocket Loader on?** It defers and rewrites scripts, which can delay or interfere with the tracker. Add `data-cfasync="false"` to the script tag. See [Cloudflare Rocket Loader](/add/script-tag#cloudflare-rocket-loader).
10. **Hash-router site with one pageview?** Add `data-hash`; see [Hash routers](/add/script-tag#hash-routers).
11. **Still stuck?** Run the server in the foreground, watch its log while you load the page, and [open an issue](https://github.com/karanjot786/trail/issues) with what you saw.

## The install check

**Settings → Install** runs checks from your server against your live site: the home page loads, the script is on it, the security policy allows Trail, events come from an allowed address, the first visit arrived, delivery in the last 24 hours, and robots.txt. Each line shows a reason and a fix.

The overall state reads **Waiting** (no real visit yet, nothing failed), **Blocked** (no real visit yet and at least one check failed) or **Receiving** (a visit has arrived). Once a site is receiving, a failing check is shown as a warning, since events are getting through.

- **Bot protection.** If Cloudflare or Vercel challenges the check's request (`403`, `429` or `503`), the home page line is a warning with the code `bot_protection`, and the script and security-policy checks wait. This does not block real visitors. To run them, allow the user agent `TrailInstallCheck` in your firewall, or open the page yourself and confirm with a test visit.
- **robots.txt.** Trail reads `/robots.txt` and warns, never fails, when it disallows AI crawlers (`robots_blocks_ai`). Cloudflare's managed robots.txt adds such rules under Security, Bots. Crawler tracking then shows little for those crawlers; your page views are not affected.
- **Preview hosts.** A refused `*.vercel.app` host gets a suggested pattern such as `*-acme.vercel.app`. See [Allowed origins](/operations/configuration#allowed-origins).

## Next

- [Configuration](/operations/configuration) lists every setting mentioned above.
- [Script tag](/add/script-tag) lists every attribute.
