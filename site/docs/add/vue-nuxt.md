---
title: Vue and Nuxt
description: Add Trail to a Vue app with inject(), or to Nuxt with a client-only plugin and a route rule.
---

# Vue and Nuxt

## Install in Vue and Nuxt

```sh
npm i trail-analytics
```

**Vue**: call `inject` once when the app starts.

::: code-group
```ts [src/main.ts]
import { createApp } from 'vue';
import { inject } from 'trail-analytics';
import App from './App.vue';

inject({ site: 'mysite' });
createApp(App).mount('#app');
```
:::

**Nuxt**: use a client-only plugin, and the route rule for the rewrite.

::: code-group
```ts [plugins/trail.client.ts]
import { inject } from 'trail-analytics';

export default defineNuxtPlugin(() => {
  inject({ site: 'mysite' });
});
```
:::

::: code-group
```ts [nuxt.config.ts]
export default defineNuxtConfig({
  routeRules: { '/_t/**': { proxy: 'https://stats.example.com/_t/**' } },
});
```
:::

## Track an event in Vue and Nuxt

```vue
<script setup lang="ts">
import { track } from 'trail-analytics';
</script>

<template>
  <button @click="track('Signup')">Sign up</button>
</template>
```

## Set consent in Vue and Nuxt

The tracker is private until consent: it stores nothing in the browser until you call `consent(true)` or `identify()`. Call `consent(true)` from your banner's accept button and `consent(false)` from decline. To skip consent, set `mode: 'full'` or `mode: 'private'`. See [Privacy modes and consent](/tracking/privacy).

## Avoid double pageviews in Vue and Nuxt

Vue Router uses the History API, which the tracker already follows. Do not call `pageview()` in `router.afterEach`.

## Verify the Vue and Nuxt install

Load a page. The network panel should show `POST /_t/e` answered with `204`, and the dashboard header should show **1 online**. On `localhost`, add `data-dev` (`dev` in code) and pick **All Environments** in the dashboard. If nothing arrives, see [Troubleshooting](/operations/troubleshooting).

## Next

- [Track events](/tracking/custom-events) and [named clicks](/tracking/named-clicks).
- Pick a [privacy mode](/tracking/privacy).
- Read your numbers in the [dashboard](/dashboard/overview).

<small>Reviewed on 2026-11-20 against `trail-analytics` 0.2.0.</small>
