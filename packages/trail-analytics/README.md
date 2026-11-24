# trail-analytics

Client SDK for [Trail](https://github.com/Karanjot786/trail), self-hosted web analytics. It adds the tracker script, queues calls made before it loads, and gives you typed `track`, `identify`, `reset` and `pageview`. About 0.9 kB gzipped, no runtime dependencies.

```sh
npm i trail-analytics
```

> You need a running Trail server. The script loads one of two ways, see [Two ways to load the script](#two-ways-to-load-the-script). See also [Adding Trail to a site](https://github.com/Karanjot786/trail#adding-trail-to-a-site).

## Two ways to load the script

| | A. First-party `/t/*` (what `init` sets up) | B. Rewrite or direct |
|---|---|---|
| Script | `/t/t.js` (or `/t/t.p.js`, `/t/t.x.js`) | `/_t/t.js` through a rewrite to your Trail server, or `https://trail.example.com/_t/t.js` directly |
| Beacon | `/t/e` | `/_t/e`, or `https://trail.example.com/_t/e` |
| Served by | the proxy file `init` adds (Next `proxy.ts`/`middleware.ts`, the Astro integration, `trail-analytics/crawl`) | your host's rewrite, or Trail itself |
| Needs | `TRAIL_URL`, `TRAIL_SITE`, `TRAIL_CRAWL_TOKEN` on the server | nothing on your server |
| Also gives | AI crawler capture, signed edge location | |

Each component defaults to B (`src` is `/_t/t.js`, or `/_t/t.p.js` with `mode="private"`), so a rewrite install keeps working. `init` writes the A paths into the tag (`src="/t/t.js" api="/t/e"`). `data-api` follows `src`: when you pass only `src`, the beacon URL is `src` with its last segment replaced by `e` (`/t/t.js` posts to `/t/e`, `https://trail.example.com/_t/t.p.js` to `https://trail.example.com/_t/e`). Pass `api` to override it.

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
- `TRAIL_URL`, `TRAIL_SITE` and `TRAIL_CRAWL_TOKEN` in `.env.local` (Next) or `.env` (Astro), unless that file is tracked by git (then init writes nothing into it and tells you what to do). Add the same three to your host's environment variables **before you deploy**; init prints the exact command for Vercel, Cloudflare and Netlify.

The token can come from `--token`, `--token -` (stdin, keeps it out of shell history), the `TRAIL_CRAWL_TOKEN` variable, the existing env file, or a hidden prompt. `--url` must be https (http is allowed for localhost and private networks). Init checks the URL and token against your server before it writes anything; `--offline` skips that check.

| Variable | What it does | Read where |
|---|---|---|
| `TRAIL_URL` | Base URL of your Trail server. Unset: `/t/t.js` answers 200 with a no-op script and `/t/e` answers 503, so previews and CI never break. | the server proxy, at runtime |
| `TRAIL_SITE` | The site id. | the server proxy, at runtime |
| `TRAIL_CRAWL_TOKEN` | Signs beacons and authorises crawler reports. Never sent to the browser. Missing: `/t/e` answers 503 `unsigned` and nothing is forwarded. | the server proxy, at runtime |

Set them in the environment of the server that runs the proxy. A change applies to new deployments only.

Running it again updates only Trail's own lines. If you already have a `proxy.ts` or `middleware.ts`, init wraps it (a default export, a named `proxy`/`middleware` function or constant) and adds Trail's paths to its `matcher`, so `/t/*` is served before your code runs. Shapes it cannot edit safely get a printed snippet:

```ts
import { withTrail } from 'trail-analytics/next/proxy';

export default withTrail(function proxy(req, event) {
  // your code
});
```

A matcher scoped to a few paths (for example `/docs/:path*`) still serves the script, but AI crawlers are only captured on matching pages. Init prints how to widen it. It also finds root layouts under `[locale]` and route groups, aliases Trail's tag as `TrailAnalytics` when `Analytics` is already taken (Vercel Analytics, your own component), and detects pnpm, yarn, bun and workspaces from `packageManager` and the lockfile. It writes the dependency into `package.json` and only runs an install when a lockfile exists.

Next's proxy runs before the route, so crawler hits show status "n/a" there. Static Astro sites never run code at request time: crawlers are not captured (use server output), and the script loads straight from `TRAIL_URL`.

Other servers use `trail-analytics/crawl` (set the same three env vars):

```ts
import { express, hono, withTrail } from 'trail-analytics/crawl';

app.use(hono());                              // Hono
app.use(express());                           // Express, before any body parser
export default { fetch: withTrail(handler) }; // Cloudflare Workers
```

Then load the script first-party: `<script defer src="/t/t.js" data-site="SITE_ID" data-api="/t/e"></script>`.

## Client IP

The proxy signs the visitor's IP and location and forwards them with the beacon. It trusts, in order:

1. `TRAIL_IP_HEADER` (or the `ipHeader` option of `trail-analytics/crawl`), when set: that header's first value, with a `:port` suffix removed. Use it for AWS CloudFront: `TRAIL_IP_HEADER=cloudfront-viewer-address` and add the header to your origin request policy.
2. Cloudflare Workers: `cf-connecting-ip` and `request.cf`.
3. Vercel (`x-vercel-id`) and Netlify (`x-nf-client-connection-ip`): the platform's own header. When that peer is a Cloudflare address (Cloudflare in front), the `cf-connecting-ip` header and Cloudflare's geo headers are used instead.
4. Unknown host: `cf-connecting-ip` only when a Cloudflare address appears in `x-forwarded-for`, otherwise the first `x-forwarded-for` value. That value can be spoofed on a server with no reverse proxy, so the proxy logs a warning; set `TRAIL_IP_HEADER`.

Cloudflare sends the country with IP Geolocation on. Region and city need the "Add visitor location headers" managed transform. Cloudflare's "Block AI bots" and managed robots.txt can stop real AI crawlers.

## Testing locally

Trail ignores localhost and automated browsers, so a local run records nothing. To see events from localhost, add `dev` to the tag: `<Analytics site="mysite" dev />`. Or deploy and check the real site with `verify`.

## Verify an install

```sh
npx trail-analytics verify --url https://your-site.example.com
```

It loads the page, finds the Trail script (in the HTML, or in the Next payload for the component), fetches the tracker, posts one `trail_verify` event (stored as a bot with `env` `verify`, so it stays out of production reports) and reads `/robots.txt`. It reports what is wrong: a missing `TRAIL_URL`, a blocked origin, a rejected token, an IP read from the wrong header, or a robots.txt that disallows AI crawlers. Flags: `--site` and `--api` override what it finds, `--json` prints JSON. It exits 1 when a check fails.

MIT
