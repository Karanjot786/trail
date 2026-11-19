# trail-analytics

Client SDK for [Trail](https://github.com/Karanjot786/trail), self-hosted web analytics. It adds the tracker script, queues calls made before it loads, and gives you typed `track`, `identify`, `reset` and `pageview`. About 0.8 kB gzipped, no runtime dependencies.

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

`inject` options: `site` (required), `src` (default `/_t/t.js`), `api`, `env`, `dev`, `route`, `vitals`, `rage`. They map to the tracker's `data-*` attributes.

## Identify and reset

```ts
import { identify, reset } from 'trail-analytics';

identify(user.id); // on login
reset();           // on logout
```

Props are flat: `string | number | boolean | null`. Calls made before the tracker loads are queued and flushed by it.

MIT
