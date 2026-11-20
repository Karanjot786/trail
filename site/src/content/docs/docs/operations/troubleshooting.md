---
title: Troubleshooting
description: A checklist for when events do not show up.
sidebar:
  order: 5
---

Work down the list. Most problems turn up in the first three steps.

1. **Is the script loading?** In the browser's network panel, `t.js` must return 200 as `application/javascript`. A 404 usually means the `/_t/*` rewrite is missing or points at the wrong host.
2. **Is the tracker running at all?** It does nothing on `localhost`, `127.*` or `[::1]` unless the tag has `data-dev`. It also skips pages that are being prerendered.
3. **Are events accepted?** Look for `POST /_t/e`:

   | Status | Meaning |
   |---|---|
   | `204` with `X-Trail-Accepted: n` | Stored. `X-Trail-Rejected: n` counts events in a batch that were skipped as invalid |
   | `400` | A bad event, a batch with no valid events, an unknown site id, or a batch with mixed sites. The response body says which |
   | `413` | Body over 64 KB |
   | `405` | Wrong method. Only `POST` and `OPTIONS` are allowed |

   "Unknown site" means `data-site` does not match an id in `TRAIL_SITES`. The server log warns at startup when `TRAIL_SITES` is empty.
4. **Accepted, but the charts are empty?** Check the environment picker. Events from a host other than the domain in `TRAIL_SITES` are tagged `preview`, `localhost` is `development`, and the dashboard shows `production` by default. See [Environments](/docs/operations/configuration/#environments).
5. **Countries empty, or all the same?** Set `TRAIL_GEO_DB`, and make sure your proxy forwards the client IP in `X-Forwarded-For`.
6. **Signed out after every restart?** Set `TRAIL_SECRET` to a fixed value of 32 or more characters.
7. **Some visits are missing?** Requests that look automated are stored with a bot flag and left out of every report. That includes browsers driven by Playwright, Puppeteer or Selenium, which set `navigator.webdriver`. Visitors who send Do Not Track or Global Privacy Control are not tracked unless you set `data-dnt="off"`.
8. **Still stuck?** Run the server in the foreground, watch its log while you load the page, and [open an issue](https://github.com/karanjot786/trail/issues) with what you saw.
