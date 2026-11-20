---
title: Astro
description: Add Trail to an Astro site with a script tag in your base layout, and avoid double pageviews with view transitions.
---

# Astro

## Install in Astro

Astro pages are HTML, so the plain tag is enough. Put it in your base layout:

::: code-group
```astro [src/layouts/Base.astro]
<head>
  <script is:inline defer src="/_t/t.js" data-site="mysite"></script>
</head>
```
:::

`is:inline` keeps Astro from bundling it. Then add the [rewrite](/install/rewrites) for your host.

## Track an event in Astro

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

## Set consent in Astro

The tracker is private until consent. Call `trail.consent(true)` from your banner's accept button and `trail.consent(false)` from decline. To skip consent, set `data-mode="full"` or `data-mode="private"` on the tag. See [Privacy modes and consent](/tracking/privacy).

## Avoid double pageviews in Astro

With Astro's view transitions (`<ClientRouter />`), navigation uses the History API and the tracker counts it. Keep the script in `<head>` with `is:inline` so it runs once, and do not call `pageview()` on `astro:page-load`.

## Verify the Astro install

Load a page. The network panel should show `POST /_t/e` answered with `204`, and the dashboard header should show **1 online**. On `localhost`, add `data-dev` (`dev` in code) and pick **All Environments** in the dashboard. If nothing arrives, see [Troubleshooting](/operations/troubleshooting).

## Next

- [Track events](/tracking/custom-events) and [named clicks](/tracking/named-clicks).
- Pick a [privacy mode](/tracking/privacy).
- Read your numbers in the [dashboard](/dashboard/overview).

<small>Reviewed on 2026-11-20 against `trail-analytics` 0.2.0.</small>
