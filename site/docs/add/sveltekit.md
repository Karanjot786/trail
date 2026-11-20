---
title: SvelteKit
description: Add Trail to a SvelteKit app.
---

# SvelteKit

## Install

```sh
npm i trail-analytics
```

Inject it from the root layout, in the browser only:

::: code-group
```svelte [src/routes/+layout.svelte]
<script lang="ts">
  import { onMount } from 'svelte';
  import { inject } from 'trail-analytics';

  let { children } = $props();
  onMount(() => inject({ site: 'mysite' }));
</script>

{@render children()}
```
:::

Serve `/_t/*` from your domain with your host's rewrite (see [Rewrites](/install/rewrites)). On a Node adapter without a proxy in front, you can forward it in a server hook:

::: code-group
```ts [src/hooks.server.ts]
import type { Handle } from '@sveltejs/kit';

const TRAIL = 'https://stats.example.com';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/_t/')) {
    const headers = new Headers(event.request.headers);
    headers.set('x-forwarded-for', event.getClientAddress());
    return fetch(TRAIL + event.url.pathname, {
      method: event.request.method,
      headers,
      body: event.request.method === 'POST' ? await event.request.text() : undefined,
    });
  }
  return resolve(event);
};
```
:::

## Track an event

```svelte
<script lang="ts">
  import { track } from 'trail-analytics';
</script>

<button onclick={() => track('Signup')}>Sign up</button>
```

## Mode and consent

By default the tracker is private until consent: nothing is stored in the browser until you call `consent(true)` or `identify()`. Wire your banner to `consent`:

```ts
import { consent } from 'trail-analytics';

acceptButton.onclick = () => consent(true);
declineButton.onclick = () => consent(false);
```

To skip consent, pass `mode: 'full'` (a site that needs no banner) or `mode: 'private'` (never stores anything, loads the smaller `t.p.js`). See [Privacy modes](/tracking/privacy).

## Avoid double pageviews

SvelteKit navigates with `history.pushState`, which the tracker counts. Do not call `pageview()` in `afterNavigate`.

## Verify

Load a page and look in the network panel for `POST /_t/e` answered with `204`. The dashboard header should show **1 online**. On `localhost`, add `dev` (or `data-dev`) first, and pick **All Environments** in the dashboard. More in [Troubleshooting](/operations/troubleshooting).

<small>Reviewed on 2026-11-20 against `trail-analytics` 0.2.0.</small>
