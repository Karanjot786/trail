---
title: npm package
description: Install trail-analytics for typed track, identify and consent calls, and inject the tracker script once.
---

# npm package

`trail-analytics` adds the tracker script for you, queues calls made before it loads, and gives you typed functions. It has no runtime dependencies and does nothing during server rendering. You still need the [`/_t/*` rewrite](/install/rewrites), unless you use `init` below.

## Install the package

```sh
npm i trail-analytics
```

```ts
import { inject } from 'trail-analytics';

inject({ site: 'mysite' }); // adds <script defer src="/_t/t.js" data-site="mysite">, once
```

`inject` options map to the script attributes: `site` (required), `src` (default `/_t/t.js`), `api`, `env`, `dev`, `route`, `vitals`, `rage`, `forms`, `errors`, `mode` (`'full'` or `'private'`) and `dnt` (`false` sends `data-dnt="off"`). Calling it twice does nothing the second time.

## Track events and identify users

```ts
import { track, identify, reset } from 'trail-analytics';

track('Signup', { plan: 'pro' }); // flat props: string, number, boolean or null
identify(user.id);                // on login
reset();                          // on logout
```

## Set it up with `init`

For Next.js 15 and 16 and Astro, one command adds a first-party `/t/*` proxy, the tag and the crawler capture:

```sh
npx trail-analytics@latest init --url https://trail.example.com --site mysite --token CRAWL_TOKEN
```

It shows a diff and asks first (`--yes` skips the question, `--dry-run` writes nothing). Running it again changes only Trail's own lines. It writes three variables to `.env.local` (Next) or `.env` (Astro), or prints them if that file is tracked by git:

| Variable | Meaning |
|---|---|
| `TRAIL_URL` | Base URL of your Trail server |
| `TRAIL_SITE` | The site id |
| `TRAIL_CRAWL_TOKEN` | Signs beacons and authorises crawler reports; never sent to the browser |

Add the same three to your host's environment variables before you deploy. The proxy reads them at runtime, and Astro also reads them from `.env` during `astro build`. A change applies to new deployments only. When `TRAIL_URL` is unset the script answers with a no-op and the beacon with `503`, so previews and CI keep working. See [AI crawlers](/add/ai-crawlers) for what it captures.

## Test and verify

Trail ignores `localhost` and automated browsers, so a local run records nothing unless the tag has `dev`. To check a deployed site, run:

```sh
npx trail-analytics verify --url https://your-site.example.com
```

It finds the script on the page, fetches it, posts one `trail_verify` event (stored as a bot with env `verify`, so it stays out of your reports) and reads `/robots.txt`. It reports a missing `TRAIL_URL`, a blocked origin, a rejected token, a wrong client IP header or a robots.txt that disallows AI crawlers. `--site` and `--api` override what it finds, `--json` prints JSON, and it exits 1 when a check fails.

## Wire a consent banner

By default the tracker is private until consent: nothing is stored in the browser until you call `consent(true)` or `identify()`. Wire your banner to `consent`:

```ts
import { consent } from 'trail-analytics';

acceptButton.onclick = () => consent(true);
declineButton.onclick = () => consent(false);
```

To skip consent, pass `mode: 'full'` (a site that needs no banner) or `mode: 'private'` (never stores anything, loads the smaller `t.p.js`). See [Privacy modes](/tracking/privacy).

## Avoid double pageviews with the package

The tracker records a pageview on load and on every history change, so single-page apps need nothing extra. Call `pageview()` only for a view that does not change the URL.

## Verify the npm install

Load a page. The network panel should show `POST /_t/e` answered with `204`, and the dashboard header should show **1 online**. On `localhost`, add `data-dev` (`dev` in code) and pick **All Environments** in the dashboard. If nothing arrives, see [Troubleshooting](/operations/troubleshooting).

## Next

- [Track events](/tracking/custom-events) and [named clicks](/tracking/named-clicks).
- Pick a [privacy mode](/tracking/privacy).
- Read your numbers in the [dashboard](/dashboard/overview).

<small>Reviewed on 2026-11-24 against `trail-analytics` 0.3.0.</small>
