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

`inject` options: `site` (required), `src` (default `/_t/t.js`), `api`, `env`, `dev`, `route`, `vitals`, `rage`, `forms`, `errors`, `mode` (`'full' | 'private'`), `dnt`. They map to the tracker's `data-*` attributes.

## Modes

| Mode | Script | Behaviour |
|------|--------|-----------|
| default (no `mode`) | `/_t/t.js` | Private until consent: nothing is stored in the browser. `consent(true)` or `identify(id)` upgrades the visitor to full mode; `consent(false)` clears browser state and stops. |
| `full` | `/_t/t.js` | Always full: id in localStorage and a first-party cookie, sessions, journeys, identify. For sites that need no consent. |
| `private` | `/_t/t.p.js` | Always private, never upgrades. Pageviews, SPA navigation, engagement, consent. No storage. |

```tsx
<Analytics site="mysite" mode="private" /> // loads /_t/t.p.js
```

`t.p.js` is 1.5 KB gzipped (1,490 B), much smaller than the full `t.js`. An explicit `src` always wins over the mode default.

## Extras

`vitals` (Core Web Vitals), `rage` (rage clicks), `forms` (form submits, records the form id or name, never field values) and `errors` (JS errors, at most 5 per page) are opt-in. `t.x.js` loads only when `data-vitals`, `data-rage`, `data-forms` or `data-errors` is set.

```tsx
<Analytics site="mysite" vitals forms errors />
```

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

The tracker honours `navigator.doNotTrack` and `navigator.globalPrivacyControl` by default: a visitor who sets either is not tracked at all (nothing is sent). To ignore the signals, pass `dnt={false}` (`data-dnt="off"`).

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

## Track AI crawlers

One command for Next.js 15/16 and Astro. Get the token from Trail → AI visibility → Unlock AI crawlers:

```sh
npx trail-analytics@latest init --url https://trail.example.com --site SITE_ID --token CRAWL_TOKEN
```

It shows a diff and asks before writing (`--yes` skips the question, `--dry-run` writes nothing). It adds:

- `proxy.ts` (Next 16) or `middleware.ts` (Next 15), or the `trail()` Astro integration. This one file reports AI crawler requests to Trail and serves the script and beacons first-party at `/t/t.js` and `/t/e`. Beacons are forwarded with your host's edge location (Vercel, Cloudflare, Netlify) and signed with the token, which never leaves your server.
- `<Analytics site="SITE_ID" src="/t/t.js" api="/t/e" />` in your root layout.
- `TRAIL_URL`, `TRAIL_SITE` and `TRAIL_CRAWL_TOKEN` in `.env.local` (Next) or `.env` (Astro). Add the same three to your host's environment variables.

Running it again changes nothing. If you already have a `proxy.ts` or `middleware.ts`, init leaves it alone and prints how to wrap it:

```ts
import { withTrail } from 'trail-analytics/next/proxy';

export default withTrail(function proxy(req, event) {
  // your code
});
```

Next's proxy runs before the route, so crawler hits show status "n/a" there. Static Astro sites never run code at request time: crawlers are not captured (use server output), and the script loads straight from `TRAIL_URL`.

Other servers use `trail-analytics/crawl` (set the same three env vars):

```ts
import { express, hono, withTrail } from 'trail-analytics/crawl';

app.use(hono());                              // Hono
app.use(express());                           // Express, before any body parser
export default { fetch: withTrail(handler) }; // Cloudflare Workers
```

Then load the script first-party: `<script defer src="/t/t.js" data-site="SITE_ID" data-api="/t/e"></script>`.

MIT
