<script setup lang="ts">
// Replaces VitePress's VPNavBar (see the alias in config.ts). Same items and
// GitHub button as the landing header (src/components/site/SiteHeader.astro),
// styled by src/styles/chrome.css, plus the docs search.
import { useLayout, VPNavBarSearch } from 'vitepress/theme-without-fonts'
import { NAV } from '../../../src/lib/nav.mjs'
import { GITHUB_URL } from '../site'

declare const __TRAIL_STARS__: string

defineProps<{ isScreenOpen?: boolean }>()
const { hasSidebar } = useLayout()
// Formatted at build time by src/lib/github-stars.mjs; '' means no count.
const stars = __TRAIL_STARS__
// Starts with the visible words (WCAG 2.5.3 label in name), then the count in words.
const ghLabel = `GitHub Star${stars ? `, ${stars} stars` : ''}`
</script>

<template>
  <div class="TrailNavBar" :class="{ 'has-sidebar': hasSidebar }">
    <div class="nav wrap">
      <div class="lead">
        <a class="brand" href="/" target="_self" aria-label="Trail home">
          <svg viewBox="0 0 256 256" width="24" height="24" aria-hidden="true"><rect x="40" y="34" width="176" height="44" rx="22" fill="currentColor"></rect><circle cx="128" cy="122" r="22" fill="currentColor"></circle><circle cx="128" cy="170" r="18" fill="currentColor"></circle><circle cx="128" cy="212" r="14" fill="var(--accent)"></circle></svg>
          Trail
        </a>
      </div>
      <VPNavBarSearch class="search" />
      <nav aria-label="Main">
        <ul class="nav-links">
          <li v-for="n in NAV" :key="n.label" :class="{ 'hide-m': n.hideSmall }">
            <a
              class="nl"
              :class="{ current: n.label === 'Docs' }"
              :href="n.href"
              :aria-current="n.label === 'Docs' ? 'page' : undefined"
              target="_self"
            >{{ n.label }}</a>
          </li>
          <li class="gh-li">
            <a class="gh" :href="GITHUB_URL" target="_blank" rel="noopener noreferrer" :aria-label="ghLabel">
              <svg class="gh-mark" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"></path></svg>
              <!-- same line on purpose: the space keeps "GitHub Star" as the visible name (Vue drops newline-only whitespace) -->
              <span class="gh-label">GitHub</span> <span class="gh-star" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"></path></svg>Star<span class="gh-count" data-stars>{{ stars && `· ${stars}` }}</span></span>
            </a>
          </li>
        </ul>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  max-width: var(--vp-layout-max-width);
  height: var(--vp-nav-height);
  margin-inline: auto;
  padding-inline: var(--gutter);
  /* Landing body line-height, so the brand box matches it exactly. */
  line-height: 1.6;
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
nav {
  flex: none;
}
.nav-links .nl {
  color: var(--chrome-muted);
}
.nav-links .nl.current {
  color: var(--chrome-fg);
}
@media (hover: hover) and (pointer: fine) {
  .nav-links .nl:hover {
    color: var(--chrome-fg);
  }
}
/* Search shares the bar, so the landing-only anchors go first. */
@media (max-width: 1099.98px) {
  .hide-m {
    display: none;
  }
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
  .nav-links .nl {
    padding: 0 8px;
  }
}
</style>
