---
title: SvelteKit
description: Add Trail to a SvelteKit app with inject() in the root layout, and proxy /_t/* from a server hook.
---

# SvelteKit

## Install in SvelteKit

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

## Track an event in SvelteKit

```svelte
<script lang="ts">
  import { track } from 'trail-analytics';
</script>

<button onclick={() => track('Signup')}>Sign up</button>
```

## Set consent in SvelteKit

The tracker is private until consent: it stores nothing in the browser until you call `consent(true)` or `identify()`. Call `consent(true)` from your banner's accept button and `consent(false)` from decline. To skip consent, set `mode: 'full'` or `mode: 'private'`. See [Privacy modes and consent](/tracking/privacy).

## Avoid double pageviews in SvelteKit

SvelteKit navigates with `history.pushState`, which the tracker counts. Do not call `pageview()` in `afterNavigate`.

## Verify the SvelteKit install

Load a page. The network panel should show `POST /_t/e` answered with `204`, and the dashboard header should show **1 online**. On `localhost`, add `data-dev` (`dev` in code) and pick **All Environments** in the dashboard. If nothing arrives, see [Troubleshooting](/operations/troubleshooting).

## Next

- [Track events](/tracking/custom-events) and [named clicks](/tracking/named-clicks).
- Pick a [privacy mode](/tracking/privacy).
- Read your numbers in the [dashboard](/dashboard/overview).

<small>Reviewed on 2026-11-20 against `trail-analytics` 0.2.0.</small>
