<script setup lang="ts">
// Same footer as the landing page (src/pages/index.astro).
import { useLayout } from 'vitepress/theme-without-fonts'
import { withBase } from 'vitepress'
import { GITHUB_URL, NPM_URL } from '../site'

const { hasSidebar } = useLayout()
</script>

<template>
  <footer class="foot wrap TrailFooter" :class="{ 'has-sidebar': hasSidebar }">
    <span class="brand small">
      <svg viewBox="0 0 256 256" width="18" height="18" aria-hidden="true"><rect x="40" y="34" width="176" height="44" rx="22" fill="currentColor"></rect><circle cx="128" cy="122" r="22" fill="currentColor"></circle><circle cx="128" cy="170" r="18" fill="currentColor"></circle><circle cx="128" cy="212" r="14" fill="var(--accent)"></circle></svg>
      Trail
    </span>
    <nav aria-label="Footer">
      <a :href="withBase('/quickstart')">Docs</a>
      <a :href="GITHUB_URL" target="_self">GitHub</a>
      <a :href="NPM_URL" target="_self">npm</a>
      <a :href="withBase('/changelog')">Changelog</a>
      <a :href="GITHUB_URL + '/blob/main/LICENSE'" target="_self">MIT License</a>
    </nav>
  </footer>
</template>

<style scoped>
.TrailFooter {
  line-height: 1.6;
  max-width: var(--vp-layout-max-width);
  margin-top: 64px;
}
@media (min-width: 48rem) {
  .TrailFooter {
    padding-inline: 32px;
  }
}
@media (min-width: 60rem) {
  /* Clear the fixed sidebar. */
  .TrailFooter.has-sidebar {
    padding-inline-start: calc(var(--vp-sidebar-width) + 32px);
  }
}
</style>
