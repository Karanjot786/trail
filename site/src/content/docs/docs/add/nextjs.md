---
title: Next.js
description: Add Trail to a Next.js app, with route templates such as /blog/[slug].
sidebar:
  order: 4
---

## Install

```sh
npm i trail-analytics
```

Add the rewrite so `/_t/*` is served from your own domain:

```js title="next.config.js"
module.exports = {
  async rewrites() {
    return [{ source: '/_t/:p*', destination: 'https://stats.example.com/_t/:p*' }];
  },
};
```

Then render `<Analytics>` in the root layout:

```tsx title="app/layout.tsx"
import { Analytics } from 'trail-analytics/next';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics site="mysite" />
      </body>
    </html>
  );
}
```

The Next.js component also works out the route template, such as `/blog/[slug]`, from `useParams()` and `usePathname()`, so the dashboard's Routes panel groups pages by template. On the Pages Router it falls back to the plain path.

## Track an event

```tsx
'use client';
import { track } from 'trail-analytics';

export function SignupButton() {
  return <button onClick={() => track('Signup')}>Sign up</button>;
}
```

## Mode and consent

By default the tracker is private until consent: nothing is stored in the browser until you call `consent(true)` or `identify()`. Wire your banner to `consent`:

```ts
import { consent } from 'trail-analytics';

acceptButton.onclick = () => consent(true);
declineButton.onclick = () => consent(false);
```

To skip consent, pass `mode: 'full'` (a site that needs no banner) or `mode: 'private'` (never stores anything, loads the smaller `t.p.js`). See [Privacy modes](/docs/tracking/privacy/).

## Avoid double pageviews

The component never sends a pageview of its own. The tracker counts each client navigation once, and the component only keeps the route template in step. Do not add `pageview()` calls on navigation.

## Verify

Load a page and look in the network panel for `POST /_t/e` answered with `204`. The dashboard header should show **1 online**. On `localhost`, add `dev` (or `data-dev`) first, and pick **All Environments** in the dashboard. More in [Troubleshooting](/docs/operations/troubleshooting/).

<small>Reviewed on 2026-11-20 against `trail-analytics` 0.2.0.</small>
