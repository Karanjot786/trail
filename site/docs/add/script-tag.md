---
title: Script tag
description: Add Trail to any site with one script tag, and every attribute it accepts.
---

# Script tag

This works on any site, with or without a framework. Set up the [`/_t/*` rewrite](/install/rewrites) first, then add the tag to every page, ideally in `<head>`:

```html
<script defer src="/_t/t.js" data-site="mysite"></script>
```

`data-site` must match a site id from **Settings → Add site** in the dashboard (or `TRAIL_SITES`). That is all you need for pageviews, single-page-app navigation, time on page, scroll depth and outbound link clicks. By default the tracker is private until the visitor consents; see [Privacy modes](/tracking/privacy).

## Attributes

| Attribute | Default | What it does |
|---|---|---|
| `data-site` | required | Site id from Settings (or `TRAIL_SITES`) |
| `data-api` | `/_t/e` | Where events are sent. Set a full URL only if you cannot add a rewrite |
| `data-env` | derived by the server | Tag events, e.g. `production` or `preview`. See [Environments](/operations/configuration#environments) |
| `data-dev` | off | Also track on `localhost`, `127.*` and `[::1]` |
| `data-route` | none | Route template for pageviews, such as `/blog/[slug]`, so the dashboard can group them |
| `data-mode` | private until consent | `full` stores an id from the first page; `private` never stores anything. See [Privacy modes](/tracking/privacy) |
| `data-dnt` | honour the signals | `off` tracks visitors who send Do Not Track or Global Privacy Control. See [DNT and GPC](/tracking/dnt) |
| `data-vitals` | off | Report web vitals |
| `data-rage` | off | Report rage clicks |
| `data-forms` | off | Report form submits: the form's `id` or `name`, never field values |
| `data-errors` | off | Report JavaScript errors, at most 5 distinct ones per page load |

On/off attributes are on when present, whatever their value: `data-dev` and `data-dev="1"` mean the same.

The last four load a small second file, `t.x.js`, only when one of them is set. See [Extras](/tracking/extras).

To name clicks on buttons and links without code, add `data-trail="Name"` to the element itself, not to the script tag. See [Named clicks](/tracking/named-clicks).

## Add a site

Open **Settings** in the dashboard and click **Add site**. Enter the domain the site runs on, such as `example.com`. Trail suggests a site id from it; that id goes in `data-site` and cannot be changed later.

The site's **Install** panel has copy-ready code for a script tag, npm, Next.js, React and a Vercel rewrite, filled in with your site id and Trail host. It checks the server every 3 seconds and reads "Waiting for the first event…" until one arrives, then "Receiving data" with the time of the last event.

You can also seed sites at startup with `TRAIL_SITES=id=domain,...`. Sites you edit in the dashboard keep their edits.

## Allowed origins

`/_t/e` takes events for a site only from a browser page on an allowed host. Trail reads the `Origin` header, or the `Referer` host when there is no `Origin`. These are allowed:

- the site's domain and any subdomain of it (`example.com` and `www.example.com`, but not `evil-example.com`);
- each entry in the site's allowed origins: an exact host such as `staging.example.org`, or a pattern such as `*.vercel.app` for every subdomain of `vercel.app` (Vercel preview deployments). Up to 20 entries;
- `localhost`, `127.0.0.1` and `[::1]`, so local development works.

Anything else gets an empty `403`, and the dashboard warns that events were rejected (counted for about the last 24 hours, reset on restart). A request with neither header is refused too. A [rewrite](/install/rewrites) on your own domain still works, because the browser sends your domain as the `Origin`. Edit the list under **Settings → ⋯ → Allowed origins**.

## The private-only file

`/_t/t.p.js` takes the same attributes except `data-mode`. It never stores anything in the browser and leaves out identify, consent upgrades and named clicks, which makes it smaller:

```html
<script defer src="/_t/t.p.js" data-site="mysite"></script>
```

## Load and caching

Trail serves `t.js` gzipped to browsers that accept it, with an `ETag`, so a repeat visit gets a `304`. It is cached for an hour (`Cache-Control: public, max-age=3600`).

## Calls before the script loads

The tag is `defer`, so code that runs earlier cannot call `trail` yet. Define a small queue and Trail replays it when it starts:

```html
<script>
  window.trail = window.trail || function () { (window.trailq = window.trailq || []).push(arguments); };
</script>
<script defer src="/_t/t.js" data-site="mysite"></script>
```

Before the tracker loads, call the stub with the method name first, as in `trail('track', 'Signup', { plan: 'pro' })`. Once it has loaded, `window.trail` is the real API: `trail.track('Signup')`. If the same code can run on either side of that moment, the [npm package](/add/npm) handles both for you.

## Avoid double pageviews

The tracker records a pageview on load, on every `history.pushState`, and on back and forward navigation. Do not also call `trail.pageview()` on route changes, or each navigation counts twice. Call it yourself only when the URL does not change but you want a new view, such as a modal that acts as a page.

## Check it

Open the page, then look in the network panel for a `POST /_t/e` with status `204`. In the dashboard, the site's **Install** panel under Settings switches from "Waiting for the first event…" to "Receiving data", and the header shows **1 online**. If nothing arrives, follow [Troubleshooting](/operations/troubleshooting).
