---
title: Vue and Nuxt
description: Add Trail to a Vue app or a Nuxt site.
---

# Vue and Nuxt

## Install

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

## Track an event

```vue
<script setup lang="ts">
import { track } from 'trail-analytics';
</script>

<template>
  <button @click="track('Signup')">Sign up</button>
</template>
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

Vue Router uses the History API, which the tracker already follows. Do not call `pageview()` in `router.afterEach`.

## Verify

Load a page and look in the network panel for `POST /_t/e` answered with `204`. The dashboard header should show **1 online**. On `localhost`, add `dev` (or `data-dev`) first, and pick **All Environments** in the dashboard. More in [Troubleshooting](/operations/troubleshooting).

<small>Reviewed on 2026-11-20 against `trail-analytics` 0.2.0.</small>
