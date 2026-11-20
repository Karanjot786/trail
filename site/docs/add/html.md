---
title: Plain HTML
description: Add Trail to a static site with one script tag in the head, no build step, plus event tracking and consent.
---

# Plain HTML

## Install in plain HTML

Add the tag to the `<head>` of every page, and the [rewrite](/install/rewrites) on your host:

```html
<script defer src="/_t/t.js" data-site="mysite"></script>
```

If you cannot add a rewrite, point both URLs at the Trail host instead. Ad blockers are more likely to stop it this way.

```html
<script defer src="https://stats.example.com/_t/t.js" data-site="mysite"
  data-api="https://stats.example.com/_t/e"></script>
```

## Track an event in plain HTML

```html
<button data-trail="Signup">Sign up</button>
<script>
  // or from code, once the tracker has loaded
  document.querySelector('#newsletter').addEventListener('submit', () => trail.track('Newsletter'));
</script>
```

## Set consent in plain HTML

The tracker is private until consent. Call `trail.consent(true)` from your banner's accept button and `trail.consent(false)` from decline. To skip consent, set `data-mode="full"` or `data-mode="private"` on the tag. See [Privacy modes and consent](/tracking/privacy).

## Avoid double pageviews in plain HTML

Each page load is one pageview. If your site swaps pages with JavaScript and the History API, those count too; do not call `trail.pageview()` as well.

## Verify the plain HTML install

Load a page. The network panel should show `POST /_t/e` answered with `204`, and the dashboard header should show **1 online**. On `localhost`, add `data-dev` (`dev` in code) and pick **All Environments** in the dashboard. If nothing arrives, see [Troubleshooting](/operations/troubleshooting).

## Next

- [Track events](/tracking/custom-events) and [named clicks](/tracking/named-clicks).
- Pick a [privacy mode](/tracking/privacy).
- Read your numbers in the [dashboard](/dashboard/overview).

<small>Reviewed on 2026-11-20 against `trail-analytics` 0.2.0.</small>
