---
title: AI crawlers
description: Capture AI crawler requests and serve the Trail script first-party with one command, npx trail-analytics init, for Next.js and Astro.
---

# AI crawlers

AI crawlers fetch your pages but never run JavaScript, so the Trail script cannot see them. Your server can. One command adds a server hook to a Next.js or Astro project. The hook does two jobs:

- it reports requests from known AI crawlers to Trail, for the [AI visibility](/dashboard/ai-visibility) funnel and the Crawlers tab;
- it serves the script and its beacons from your own domain at `/t/t.js` and `/t/e`, and forwards the beacons to Trail with your host's edge location.

AI browsing agents that run your script need none of this: Trail recognises them from the requests the script already sends. The hook only helps verify ChatGPT agent, which signs page requests but not the script's requests.

## Run init

In Trail, open **AI visibility** and click **Create token and copy command** on the **Unlock AI crawlers** card. Run the copied command in your project's root:

```sh
npx trail-analytics@latest init --url https://trail.example.com --site mysite --token <token>
```

| Flag | What it does |
|---|---|
| `--url <url>` | Your Trail server |
| `--site <id>` | The site id in Trail |
| `--token <token>` | The crawl token from the card. It is kept in your env file only. `--token -` reads it from stdin |
| `--yes`, `-y` | Apply without asking |
| `--dry-run` | Show the changes and write nothing |
| `--cwd <dir>` | Project directory (default: the current directory) |
| `--no-install` | Do not install `trail-analytics` |
| `--offline` | Skip the check that your Trail server is reachable and accepts the token |
| `--help`, `-h` | Show the help |

The token can come from `--token`, `--token -` (stdin, which keeps it out of shell history), the `TRAIL_CRAWL_TOKEN` variable, the existing env file, or a hidden prompt on a terminal. `--url` must be https (http is allowed for localhost and private networks).

Before it writes anything, init checks that your Trail server is reachable and accepts the token. `--offline` skips that check.

Init prints a diff, the warnings and any manual steps, then asks `Apply these changes? [y/N]`. Without a terminal it refuses unless you pass `--yes`. Running it again changes only Trail's own lines. It detects pnpm, yarn, bun and workspaces from `packageManager` and the lockfile, and writes `trail-analytics@^0.3.0` into `package.json`. It runs an install only when a lockfile exists and you did not pass `--no-install`.

After you deploy, run `npx trail-analytics verify --url https://your-site` to check the install end to end. See [the npm package](/add/npm#test-and-verify).

Exit codes: `0` applied or nothing to do, `1` error, `2` unsupported framework or manual steps needed (they are printed).

## What init writes

| Project | Hook file | Script | Env file |
|---|---|---|---|
| Next.js 16 | `proxy.ts` (or `.js`; in `src/` when you use it) | `<Analytics site="mysite" src="/t/t.js" api="/t/e" />` in `app/layout` | `.env.local` |
| Next.js 15 | `middleware.ts` (or `.js`; in `src/` when you use it) | the same | `.env.local` |
| Astro | none: `trail({ site: "mysite" })` in `integrations` in `astro.config` | added by the integration | `.env` |

For a new Next.js hook file, init writes a three-line wrapper:

::: code-group
```ts [proxy.ts]
import type { NextFetchEvent, NextRequest } from 'next/server';
import trail from 'trail-analytics/next/proxy';

// Reports AI crawlers to Trail and serves /t/t.js and /t/e first-party (signed, with your host's edge geo).
export default function proxy(req: NextRequest, event: NextFetchEvent) {
  return trail(req, event);
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };
```
:::

Next.js 15 gets the same file as `middleware.ts`, with `export function middleware`. The layout gains `import { Analytics } from 'trail-analytics/next'` after the last import and the tag just before `</body>`. If the layout already renders `<Analytics>` from `trail-analytics/next`, init only adds the `src` and `api` props.

If a `proxy` or `middleware` file already exists, init wraps it instead of replacing it: a default export, or a named `proxy` or `middleware` function or constant, becomes `withTrail(...)`. It also adds Trail's four paths to the file's `matcher`, so `/t/*` is served before your code runs. A matcher scoped to a few paths still serves the script, but crawlers are captured only on matching pages, and init prints how to widen it.

Init also finds root layouts under `[locale]` and route groups, and imports Trail's tag as `TrailAnalytics` when `Analytics` is already taken (Vercel Analytics, your own component).

Init prints a manual step instead of a change when:

- **it cannot edit your proxy or middleware file safely.** This covers an export list or re-export, more than one proxy export, a handler referenced elsewhere in the file, a file that does not parse, or a `matcher` built at runtime. Wrap the handler yourself:

  ```ts
  import { withTrail } from 'trail-analytics/next/proxy';

  export default withTrail(function proxy(req, event) {
    // your existing code; return NextResponse.next() (or nothing) to continue
  });
  ```

  Keep, or add, a matcher that includes `/t/t.js`, `/t/t.x.js`, `/t/t.p.js` and `/t/e`.
- **the app uses the Pages Router.** Render `<Analytics site="mysite" src="/t/t.js" api="/t/e" />` from `trail-analytics/react` in `pages/_app`.
- **the layout has no `</body>`, or more than one**, uses both the names `Analytics` and `TrailAnalytics`, or the Astro config has no `defineConfig({`.
- **the env file is tracked by git.** Init will not write the token into it. Run `git rm --cached <file> && echo <file> >> .gitignore`, then rerun init, or set the three variables only in your host.

If `app/t`, `src/app/t`, `pages/t` or `src/pages/t` exists, init warns that `/t/t.js` and `/t/e` are now served by Trail. Other `/t/...` paths still reach your routes.

### Static sites

Static Astro output never runs code at request time. Init warns, crawlers are not captured, and the integration loads the script straight from `TRAIL_URL/_t/t.js` with no first-party path and no edge location. Use server output, or import your access logs (below). On a Node adapter, set `site` in `astro.config` so Astro's origin check accepts the `/t/e` beacons.

A Next.js static export (`output: 'export'`) has no proxy or middleware either, so the same limits apply.

## The env file and the token

Init appends only the lines that are missing, and keeps the file's line endings:

```sh
TRAIL_URL=https://trail.example.com
TRAIL_SITE=mysite
TRAIL_CRAWL_TOKEN=<token>
```

If the env file is not git-ignored, init adds it to `.gitignore`. Add the same three variables to your host's environment settings before you deploy.

- The token is shown once in Trail, and init masks it in its output as `••••` plus its last four characters.
- It has the `crawl` scope: it can only add crawler requests to that one site. It cannot read anything.
- It stays on your server. It is never a `NEXT_PUBLIC_` or `PUBLIC_` variable.
- Revoke it in **Settings → API tokens**. That also stops Trail trusting the location your proxy sends.

## The first-party proxy

The hook serves two paths on your domain:

| Path | Forwards to |
|---|---|
| `GET /t/t.js` | `TRAIL_URL/_t/t.js`, with its cache headers |
| `POST /t/e` | `TRAIL_URL/_t/e`, with the original body, `Origin`, `Referer` and `User-Agent` |

Every other path is untouched. The path is `/t`, not `/_t`, because Next.js treats `_` folders as private and Astro skips `_` pages. A first-party script and beacon are not blocked as a third-party host, and they replace the manual [rewrite](/install/rewrites) for Next.js and Astro.

### The signed forward

Each beacon carries what the edge knows about the visitor:

| Header | Value |
|---|---|
| `X-Trail-IP` | The client IP the edge saw |
| `X-Trail-Geo` | `country\|region\|city` from the edge |
| `X-Trail-Geo-Src` | `vercel`, `cloudflare`, `netlify` or empty |
| `X-Trail-Host` | Your site's host |
| `X-Trail-Proxy` | `v1;k=<token prefix>;t=<unix seconds>;s=<HMAC>` |

The HMAC-SHA256 is keyed with the SHA-256 of your crawl token and covers the site, time, IP, location, source, host and a hash of the body. Trail accepts the headers only when the token prefix belongs to a crawl token of that site that is not revoked, the time is within 300 seconds, and the HMAC matches. Otherwise it ignores every `X-Trail-*` header and treats the beacon like any other. The token itself is never sent.

Web Bot Auth headers (`Signature`, `Signature-Input`, `Signature-Agent`) are passed through unchanged, so Trail can verify a signed AI agent.

### Location accuracy

The edge location comes from Cloudflare (`request.cf`), then Vercel's `x-vercel-ip-*` headers, then Netlify's `x-nf-geo`. Without a proxy, Trail uses Cloudflare's headers when it sits behind Cloudflare, then its own database. See [Geo database](/operations/geo).

The Overview's Location panel labels the result. Countries carry no label, the tabs read **Regions · approximate** and **Cities · rough estimate**, and a chip names the source, such as "Location: your edge (Vercel)".

## Other servers

Init does not support other frameworks yet. It prints this snippet and exits with `2`. Use `trail-analytics/crawl` with the same three env vars:

```ts
import { express, hono, withTrail } from 'trail-analytics/crawl';

app.use(hono());                              // Hono
app.use(express());                           // Express, before any body parser
export default { fetch: withTrail(handler) }; // Cloudflare Workers
```

Then load the script first-party:

```html
<script defer src="/t/t.js" data-site="mysite" data-api="/t/e"></script>
```

Without a server hook, import an nginx, Apache or Caddy access log with the Trail binary:

```sh
trail crawlers import --site mysite --format combined access.log
trail crawlers import --site mysite --format caddy --url https://trail.example.com --token <token> access.log
```

The first form writes to `TRAIL_DB` on the Trail server. The second ships the crawler requests to a remote Trail over HTTPS (the token can also come from `TRAIL_TOKEN`). `--since auto` (the default) skips records already stored.

## Check it works

Deploy, then open **AI visibility**. The card's status turns to **Receiving** when the first crawler request arrives, which can take hours. To test sooner:

```sh
curl -A "GPTBot/1.2" https://example.com/
```

Your pages should still load the script from `/t/t.js` and send `POST /t/e`.

## Next

- Read the [AI visibility](/dashboard/ai-visibility) screen.
- Learn how Trail picks a location in [Geo database](/operations/geo).
