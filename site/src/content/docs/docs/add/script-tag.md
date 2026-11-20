---
title: Script tag
description: Add Trail to any site with one script tag, and every attribute it accepts.
sidebar:
  order: 1
---

This works on any site, with or without a framework. Set up the [`/_t/*` rewrite](/docs/install/rewrites/) first, then add the tag to every page, ideally in `<head>`:

```html
<script defer src="/_t/t.js" data-site="mysite"></script>
```

`data-site` must match an id in `TRAIL_SITES`. That is all you need for pageviews, single-page-app navigation, time on page, scroll depth and outbound link clicks. By default the tracker is private until the visitor consents; see [Privacy modes](/docs/tracking/privacy/).

## Attributes

| Attribute | Default | What it does |
|---|---|---|
| `data-site` | required | Site id from `TRAIL_SITES` |
| `data-api` | `/_t/e` | Where events are sent. Set a full URL only if you cannot add a rewrite |
| `data-env` | derived by the server | Tag events, e.g. `production` or `preview`. See [Environments](/docs/operations/configuration/#environments) |
| `data-dev` | off | Also track on `localhost`, `127.*` and `[::1]` |
| `data-route` | none | Route template for pageviews, such as `/blog/[slug]`, so the dashboard can group them |
| `data-mode` | private until consent | `full` stores an id from the first page; `private` never stores anything. See [Privacy modes](/docs/tracking/privacy/) |
| `data-dnt` | honour the signals | `off` tracks visitors who send Do Not Track or Global Privacy Control. See [DNT and GPC](/docs/tracking/dnt/) |
| `data-vitals` | off | Report web vitals |
| `data-rage` | off | Report rage clicks |
| `data-forms` | off | Report form submits |
| `data-errors` | off | Report JavaScript errors |

On/off attributes are on when present, whatever their value: `data-dev` and `data-dev="1"` mean the same.

The last four load a small second file, `t.x.js`, only when one of them is set. See [Extras](/docs/tracking/extras/).

To name clicks on buttons and links without code, add `data-trail="Name"` to the element itself, not to the script tag. See [Named clicks](/docs/tracking/named-clicks/).

## The private-only file

`/_t/t.p.js` takes the same attributes except `data-mode`. It never stores anything in the browser and leaves out identify, consent upgrades and named clicks, which makes it smaller:

```html
<script defer src="/_t/t.p.js" data-site="mysite"></script>
```

## Calls before the script loads

The tag is `defer`, so code that runs earlier cannot call `trail` yet. Define a small queue and Trail replays it when it starts:

```html
<script>
  window.trail = window.trail || function () { (window.trailq = window.trailq || []).push(arguments); };
</script>
<script defer src="/_t/t.js" data-site="mysite"></script>
```

Before the tracker loads, call the stub with the method name first, as in `trail('track', 'Signup', { plan: 'pro' })`. Once it has loaded, `window.trail` is the real API: `trail.track('Signup')`. If the same code can run on either side of that moment, the [npm package](/docs/add/npm/) handles both for you.

## Avoid double pageviews

The tracker records a pageview on load, on every `history.pushState`, and on back and forward navigation. Do not also call `trail.pageview()` on route changes, or each navigation counts twice. Call it yourself only when the URL does not change but you want a new view, such as a modal that acts as a page.

## Check it

Open the page, then look in the network panel for a `POST /_t/e` with status `204`, and in the dashboard header for **1 online**. If nothing arrives, follow [Troubleshooting](/docs/operations/troubleshooting/).
