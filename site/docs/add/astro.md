---
title: Astro
description: Add Trail to an Astro site with a script tag in your layout.
---

# Astro

## Install

Astro pages are HTML, so the plain tag is enough. Put it in your base layout:

::: code-group
```astro [src/layouts/Base.astro]
<head>
  <script is:inline defer src="/_t/t.js" data-site="mysite"></script>
</head>
```
:::

`is:inline` keeps Astro from bundling it. Then add the [rewrite](/install/rewrites) for your host.

## Track an event

Give elements a name and the tracker records clicks on them, no script needed:

```astro
<a href="/signup" data-trail="Signup">Sign up</a>
```

For events from code, call the global:

```astro
<script>
  document.querySelector('form')?.addEventListener('submit', () => window.trail?.track('Contact sent'));
</script>
```

## Mode and consent

The default is private until consent. Call `trail.consent(true)` from your banner's accept button and `trail.consent(false)` from decline. To skip consent, set `data-mode="full"` or `data-mode="private"` on the tag. See [Privacy modes](/tracking/privacy).

## Avoid double pageviews

With Astro's view transitions (`<ClientRouter />`), navigation uses the History API and the tracker counts it. Keep the script in `<head>` with `is:inline` so it runs once, and do not call `pageview()` on `astro:page-load`.

## Verify

Load a page and look in the network panel for `POST /_t/e` answered with `204`. The dashboard header should show **1 online**. On `localhost`, add `dev` (or `data-dev`) first, and pick **All Environments** in the dashboard. More in [Troubleshooting](/operations/troubleshooting).

<small>Reviewed on 2026-11-20 against `trail-analytics` 0.2.0.</small>
