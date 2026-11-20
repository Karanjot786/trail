<script setup lang="ts">
// Same links and meta line as the landing footer (src/components/site/SiteFooter.astro),
// without the dot-letter word. Links and copy come from src/copy/landing.ts.
import { useLayout } from 'vitepress/theme-without-fonts'
import { footer } from '../../../src/copy/landing'
import { GITHUB_URL, isDocsPath } from '../site'

const { hasSidebar } = useLayout()
// Docs links stay in the SPA; everything else leaves it.
const target = (href: string) => (isDocsPath(href) ? undefined : '_self')
</script>

<template>
  <footer class="TrailFooter" :class="{ 'has-sidebar': hasSidebar }">
    <div class="row">
      <span class="brand small">
        <svg viewBox="0 0 256 256" width="18" height="18" aria-hidden="true"><rect x="40" y="34" width="176" height="44" rx="22" fill="currentColor"></rect><circle cx="128" cy="122" r="22" fill="currentColor"></circle><circle cx="128" cy="170" r="18" fill="currentColor"></circle><circle cx="128" cy="212" r="14" fill="var(--accent)"></circle></svg>
        Trail
      </span>
      <nav aria-label="Footer">
        <a v-for="l in footer.links" :key="l.text" :href="l.href" :target="l.href === GITHUB_URL ? '_blank' : target(l.href)" :rel="l.href === GITHUB_URL ? 'noopener noreferrer' : undefined">{{ l.text }}</a>
      </nav>
    </div>
    <p class="foot-meta">
      <span>{{ footer.meta }}</span>
      <a class="foot-repo" :href="GITHUB_URL" target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"></path></svg>
        {{ footer.repoLabel }}
      </a>
    </p>
  </footer>
</template>

<style scoped>
.TrailFooter {
  width: 100%;
  max-width: var(--vp-layout-max-width);
  margin: 64px auto 0;
  padding: 32px var(--gutter) 40px;
  border-top: 1px solid var(--line);
  line-height: 1.6;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.brand.small {
  height: auto;
  font-size: 15px;
}
.brand.small svg {
  width: 18px;
  height: 18px;
}
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  /* optical: the last link's text ends on the repo link's right edge */
  margin-inline-end: -12px;
}
nav a {
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--muted);
  font-size: 15px;
  text-decoration: none;
  transition: color 150ms, background-color 150ms;
}
@media (hover: hover) and (pointer: fine) {
  nav a:hover {
    color: var(--fg);
    background: var(--raised);
  }
}
.foot-meta {
  margin-top: 12px;
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
