<script setup lang="ts">
// Replaces VitePress's VPNavBar (see the alias in config.ts). Same markup as
// the landing header in src/pages/index.astro, plus the docs search.
import { useLayout, VPNavBarSearch } from 'vitepress/theme-without-fonts'
import { withBase } from 'vitepress'
import { DEMO_URL, GITHUB_URL } from '../site'

defineProps<{ isScreenOpen?: boolean }>()
const { hasSidebar } = useLayout()
</script>

<template>
  <div class="TrailNavBar" :class="{ 'has-sidebar': hasSidebar }">
    <div class="nav wrap">
      <div class="lead">
        <a class="brand" href="/" target="_self" aria-label="Trail home">
          <svg viewBox="0 0 256 256" width="22" height="22" aria-hidden="true"><rect x="40" y="34" width="176" height="44" rx="22" fill="currentColor"></rect><circle cx="128" cy="122" r="22" fill="currentColor"></circle><circle cx="128" cy="170" r="18" fill="currentColor"></circle><circle cx="128" cy="212" r="14" fill="var(--accent)"></circle></svg>
          Trail
        </a>
      </div>
      <VPNavBarSearch class="search" />
      <nav aria-label="Main">
        <a :href="withBase('/')" class="current">Docs</a>
        <a :href="DEMO_URL" target="_self">Demo</a>
        <a :href="GITHUB_URL" target="_self">GitHub</a>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.TrailNavBar {
  position: relative;
  height: var(--vp-nav-height);
  background: var(--vp-nav-bg-color);
  border-bottom: 1px solid var(--line);
}
@supports (backdrop-filter: blur(1px)) {
  .TrailNavBar {
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    backdrop-filter: blur(12px) saturate(1.4);
  }
}
.nav {
  /* Landing body line-height, so the brand box matches it exactly. */
  line-height: 1.6;
  max-width: var(--vp-layout-max-width);
  height: var(--vp-nav-height);
  gap: 8px;
  pointer-events: auto;
}
.lead {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.search {
  flex: 1;
  min-width: 0;
}
nav a.current {
  color: var(--fg);
}
@media (min-width: 48rem) {
  .nav {
    padding-inline: 32px;
  }
}
@media (min-width: 60rem) {
  /* The brand column matches the sidebar width on every page, so search
     sits in one place. */
  .lead {
    width: calc(var(--vp-sidebar-width) - 32px);
  }
}
@media (max-width: 560px) {
  /* Keep the 24px gutter VitePress uses for the page body. */
  .nav nav a {
    padding: 10px 8px;
  }
}
</style>
