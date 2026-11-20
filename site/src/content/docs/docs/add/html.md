---
title: Plain HTML
description: Add Trail to a static site with nothing but HTML.
sidebar:
  order: 8
---

## Install

Add the tag to the `<head>` of every page, and the [rewrite](/docs/install/rewrites/) on your host:

```html
<script defer src="/_t/t.js" data-site="mysite"></script>
```

If you cannot add a rewrite, point both URLs at the Trail host instead. Ad blockers are more likely to stop it this way.

```html
<script defer src="https://stats.example.com/_t/t.js" data-site="mysite"
  data-api="https://stats.example.com/_t/e"></script>
```

## Track an event

```html
<button data-trail="Signup">Sign up</button>
<script>
  // or from code, once the tracker has loaded
  document.querySelector('#newsletter').addEventListener('submit', () => trail.track('Newsletter'));
</script>
```

## Mode and consent

The default is private until consent. From your banner, call `trail.consent(true)` on accept and `trail.consent(false)` on decline. To skip consent, add `data-mode="full"` or `data-mode="private"` to the tag. See [Privacy modes](/docs/tracking/privacy/).

## Avoid double pageviews

Each page load is one pageview. If your site swaps pages with JavaScript and the History API, those count too; do not call `trail.pageview()` as well.

## Verify

Load a page and look in the network panel for `POST /_t/e` answered with `204`. The dashboard header should show **1 online**. On `localhost`, add `dev` (or `data-dev`) first, and pick **All Environments** in the dashboard. More in [Troubleshooting](/docs/operations/troubleshooting/).

<small>Reviewed on 2026-11-20 against `trail-analytics` 0.2.0.</small>
