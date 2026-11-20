---
title: npm package
description: Install trail-analytics for typed track, identify and consent calls, and inject the tracker script once.
---

# npm package

`trail-analytics` adds the tracker script for you, queues calls made before it loads, and gives you typed functions. It has no runtime dependencies and does nothing during server rendering. You still need the [`/_t/*` rewrite](/install/rewrites).

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

<small>Reviewed on 2026-11-20 against `trail-analytics` 0.2.0.</small>
