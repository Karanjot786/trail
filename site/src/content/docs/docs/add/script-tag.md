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

`data-site` must match an id in `TRAIL_SITES`. That is all you need for pageviews, single-page-app navigation, time on page, scroll depth, outbound link clicks, form submits and JavaScript errors.

## Attributes

| Attribute | Default | What it does |
|---|---|---|
| `data-site` | required | Site id from `TRAIL_SITES` |
| `data-api` | `/_t/e` | Where events are sent. Set a full URL only if you cannot add a rewrite |
| `data-env` | derived by the server | Tag events, e.g. `production` or `preview`. See [Environments](/docs/operations/configuration/#environments) |
| `data-dev` | off | Also track on `localhost`, `127.*` and `[::1]` |
| `data-route` | none | Route template for pageviews, such as `/blog/[slug]`, so the dashboard can group them |
| `data-vitals` | off | Load `t.x.js` and report web vitals |
| `data-rage` | off | Load `t.x.js` and report rage clicks |

Boolean attributes are on when present, whatever their value: `data-dev` and `data-dev="1"` mean the same.

## Calls before the script loads

The tag is `defer`, so code that runs earlier cannot call `trail` yet. Define a small queue and Trail replays it when it starts:

```html
<script>
  window.trail = window.trail || function () { (window.trailq = window.trailq || []).push(arguments); };
</script>
<script defer src="/_t/t.js" data-site="mysite"></script>
```

## Avoid double pageviews

The tracker records a pageview on load, on every `history.pushState`, and on back and forward navigation. Do not also call `trail.pageview()` on route changes, or each navigation counts twice. Call it yourself only when the URL does not change but you want a new view, such as a modal that acts as a page.

## Check it

Open the page, then look in the network panel for a `POST /_t/e` with status `204`, and in the dashboard header for **1 online**. If nothing arrives, follow [Troubleshooting](/docs/operations/troubleshooting/).
