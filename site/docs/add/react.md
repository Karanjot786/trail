---
title: React
description: Add Trail to a React app with the Analytics component, then track events and set consent.
---

# React

## Install in React

```sh
npm i trail-analytics
```

Render `<Analytics>` once, near the root:

::: code-group
```tsx [src/main.tsx]
import { Analytics } from 'trail-analytics/react';

root.render(
  <>
    <App />
    <Analytics site="mysite" />
  </>,
);
```
:::

It renders nothing; it adds the script on mount. Props are the same as [`inject`](/add/npm).

## Track an event in React

```tsx
import { track } from 'trail-analytics';

<button onClick={() => track('Signup', { plan: 'pro' })}>Sign up</button>
```

Or, with no code, give the element a name: `<button data-trail="Signup">`. See [Named clicks](/tracking/named-clicks).

## Set consent in React

The tracker is private until consent: it stores nothing in the browser until you call `consent(true)` or `identify()`. Call `consent(true)` from your banner's accept button and `consent(false)` from decline. To skip consent, set `mode: 'full'` or `mode: 'private'`. See [Privacy modes and consent](/tracking/privacy).

## Avoid double pageviews in React

React Router, TanStack Router and other client routers change the URL with `history.pushState`, which the tracker already counts. Do not call `pageview()` in a route effect.

## Verify the React install

Load a page. The network panel should show `POST /_t/e` answered with `204`, and the dashboard header should show **1 online**. On `localhost`, add `data-dev` (`dev` in code) and pick **All Environments** in the dashboard. If nothing arrives, see [Troubleshooting](/operations/troubleshooting).

## Next

- [Track events](/tracking/custom-events) and [named clicks](/tracking/named-clicks).
- Pick a [privacy mode](/tracking/privacy).
- Read your numbers in the [dashboard](/dashboard/overview).

<small>Reviewed on 2026-11-20 against `trail-analytics` 0.2.0.</small>
