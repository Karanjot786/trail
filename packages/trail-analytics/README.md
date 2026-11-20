# trail-analytics

Client SDK for [Trail](https://github.com/Karanjot786/trail), self-hosted web analytics. It adds the tracker script, queues calls made before it loads, and gives you typed `track`, `identify`, `reset` and `pageview`. About 0.9 kB gzipped, no runtime dependencies.

```sh
npm i trail-analytics
```

> You need a running Trail server and a `/_t/*` rewrite to it. See [Adding Trail to a site](https://github.com/Karanjot786/trail#adding-trail-to-a-site).

## Next.js (App Router)

```tsx
// app/layout.tsx
import { Analytics } from 'trail-analytics/next';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <Analytics site="mysite" />
      </body>
    </html>
  );
}
```

Route patterns such as `/blog/[slug]` are computed from `useParams()` and `usePathname()`. The tracker already records a pageview on every `pushState`/`popstate`, so the component never fires its own: it only keeps `data-route` in sync (during render, before Next commits the URL change). One navigation, one pageview. On the Pages Router `useParams()` is empty and the plain path is used.

## React

```tsx
import { Analytics } from 'trail-analytics/react';

<Analytics site="mysite" />
```

## Vanilla

```ts
import { inject, track } from 'trail-analytics';

inject({ site: 'mysite' }); // idempotent, no-op on the server
track('signup_clicked', { plan: 'pro' });
```

`inject` options: `site` (required), `src` (default `/_t/t.js`), `api`, `env`, `dev`, `route`, `vitals`, `rage`, `mode` (`'full' | 'private'`), `dnt`. They map to the tracker's `data-*` attributes.

## Modes

| Mode | Script | Behaviour |
|------|--------|-----------|
| default (no `mode`) | `/_t/t.js` | Private until consent: no cookies or storage, pageviews counted anonymously. Calling `consent(true)` upgrades to full tracking. |
| `full` | `/_t/t.js` | Full tracking from the first pageview (visitor id, sessions, identify). Use where you do not need a banner. |
| `private` | `/_t/t.p.js` | Always cookieless and anonymous. Smaller build, no consent needed. `identify` and `consent` do nothing. |

```tsx
<Analytics site="mysite" mode="private" /> // loads /_t/t.p.js
```

`t.p.js` is a trimmed build of the tracker, a fraction of the size of `t.js` (see the Trail repo for the exact gzip numbers). An explicit `src` always wins over the mode default.

## Consent banner

```tsx
import { consent } from 'trail-analytics';

function Banner() {
  return (
    <div role="dialog">
      <button onClick={() => consent(true)}>Accept</button>
      <button onClick={() => consent(false)}>Decline</button>
    </div>
  );
}
```

`consent()` is queued until the tracker loads and replayed in order, like `track`.

## Do Not Track and Global Privacy Control

The tracker honours `navigator.doNotTrack` and `navigator.globalPrivacyControl` by default: a visitor who sets either stays in private mode even after `consent(true)`. To ignore the signals, pass `dnt={false}` (`data-dnt="off"`).

## Named clicks

Add `data-trail` to any element and the tracker records a click event with that name, no code needed:

```html
<button data-trail="Signup">Sign up</button>
```

## Identify and reset

```ts
import { identify, reset } from 'trail-analytics';

identify(user.id); // on login
reset();           // on logout
```

Props are flat: `string | number | boolean | null`. Calls made before the tracker loads are queued and flushed by it.

MIT
