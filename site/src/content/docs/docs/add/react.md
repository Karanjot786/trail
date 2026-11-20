---
title: React
description: Add Trail to a React app with the Analytics component.
sidebar:
  order: 3
---

## Install

```sh
npm i trail-analytics
```

Render `<Analytics>` once, near the root:

```tsx title="src/main.tsx"
import { Analytics } from 'trail-analytics/react';

root.render(
  <>
    <App />
    <Analytics site="mysite" />
  </>,
);
```

It renders nothing; it adds the script on mount. Props are the same as [`inject`](/docs/add/npm/).

## Track an event

```tsx
import { track } from 'trail-analytics';

<button onClick={() => track('Signup', { plan: 'pro' })}>Sign up</button>
```

Or, with no code, give the element a name: `<button data-trail="Signup">`. See [Named clicks](/docs/tracking/named-clicks/).

## Mode and consent

By default the tracker is private until consent: nothing is stored in the browser until you call `consent(true)` or `identify()`. Wire your banner to `consent`:

```ts
import { consent } from 'trail-analytics';

acceptButton.onclick = () => consent(true);
declineButton.onclick = () => consent(false);
```

To skip consent, pass `mode: 'full'` (a site that needs no banner) or `mode: 'private'` (never stores anything, loads the smaller `t.p.js`). See [Privacy modes](/docs/tracking/privacy/).

## Avoid double pageviews

React Router, TanStack Router and other client routers change the URL with `history.pushState`, which the tracker already counts. Do not call `pageview()` in a route effect.

## Verify

Load a page and look in the network panel for `POST /_t/e` answered with `204`. The dashboard header should show **1 online**. On `localhost`, add `dev` (or `data-dev`) first, and pick **All Environments** in the dashboard. More in [Troubleshooting](/docs/operations/troubleshooting/).

<small>Reviewed on 2026-11-20 against `trail-analytics` 0.2.0.</small>
