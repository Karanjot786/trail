---
title: Next.js
description: Add Trail to a Next.js app, with route templates such as /blog/[slug].
---

# Next.js

## Install in Next.js

```sh
npm i trail-analytics
```

Add the rewrite so `/_t/*` is served from your own domain:

::: code-group
```js [next.config.js]
module.exports = {
  async rewrites() {
    return [{ source: '/_t/:p*', destination: 'https://stats.example.com/_t/:p*' }];
  },
};
```
:::

Then render `<Analytics>` in the root layout:

::: code-group
```tsx [app/layout.tsx]
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
:::

The Next.js component also works out the route template, such as `/blog/[slug]`, from `useParams()` and `usePathname()`, so the dashboard's Routes panel groups pages by template. On the Pages Router it falls back to the plain path.

## Track an event in Next.js

```tsx
'use client';
import { track } from 'trail-analytics';

export function SignupButton() {
  return <button onClick={() => track('Signup')}>Sign up</button>;
}
```

## Set consent in Next.js

The tracker is private until consent: it stores nothing in the browser until you call `consent(true)` or `identify()`. Call `consent(true)` from your banner's accept button and `consent(false)` from decline. To skip consent, set `mode: 'full'` or `mode: 'private'`. See [Privacy modes and consent](/tracking/privacy).

## Avoid double pageviews in Next.js

The component never sends a pageview of its own. The tracker counts each client navigation once, and the component only keeps the route template in step. Do not add `pageview()` calls on navigation.

## Verify the Next.js install

Load a page. The network panel should show `POST /_t/e` answered with `204`, and the dashboard header should show **1 online**. On `localhost`, add `data-dev` (`dev` in code) and pick **All Environments** in the dashboard. If nothing arrives, see [Troubleshooting](/operations/troubleshooting).

## Next

- [Track events](/tracking/custom-events) and [named clicks](/tracking/named-clicks).
- Pick a [privacy mode](/tracking/privacy).
- Read your numbers in the [dashboard](/dashboard/overview).

<small>Reviewed on 2026-11-20 against `trail-analytics` 0.2.0.</small>
