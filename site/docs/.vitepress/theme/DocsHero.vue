<script setup lang="ts">
// Replaces VitePress's VPHomeHero on /docs (see the alias in config.ts).
// Reads hero.name, hero.tagline and hero.actions from docs/index.md.
import { onMounted, ref } from 'vue'
import { useData, withBase } from 'vitepress'

const { frontmatter: fm } = useData()
const CMD = `docker run -d --name trail -p 8080:8080 -v trail-data:/data \\
       ghcr.io/karanjot786/trail`

const mod = ref('⌘')
onMounted(() => {
  if (!/mac|iphone|ipad/i.test(navigator.platform)) mod.value = 'Ctrl'
})

// ponytail: the header button owns the modal, so the big trigger just presses it.
const openSearch = () => document.querySelector<HTMLElement>('.VPNavBarSearchButton')?.click()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  await navigator.clipboard.writeText(CMD).catch(() => {})
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <section v-if="fm.hero" class="DocsHero">
    <div class="intro">
      <h1>{{ fm.hero.name }}</h1>
      <p v-if="fm.hero.tagline" class="tagline">{{ fm.hero.tagline }}</p>
      <button type="button" class="search-trigger" @click="openSearch">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
        <span class="label">Search the docs</span>
        <span class="keys" aria-hidden="true"><kbd>{{ mod }}</kbd><kbd>K</kbd></span>
      </button>
      <p v-if="fm.hero.actions?.length" class="actions">
        <a v-for="a in fm.hero.actions" :key="a.link" :href="withBase(a.link)" :class="'is-' + a.theme">
          {{ a.text }}<span aria-hidden="true"> →</span>
        </a>
      </p>
    </div>

    <figure class="run">
      <figcaption>
        <span>Run Trail in one command</span>
        <button type="button" class="copy" :class="{ done: copied }" :aria-label="copied ? 'Copied' : 'Copy command'" @click="copy">
          <svg class="i-copy" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
          <svg class="i-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </figcaption>
      <pre tabindex="0"><code>{{ CMD }}</code></pre>
      <p class="note">Then open <code>localhost:8080</code> and sign in with <code>change-me</code>.</p>
    </figure>
  </section>
</template>

<style scoped>
.DocsHero {
  display: grid;
  gap: 40px;
  max-width: 1104px;
  margin: 0 auto;
  padding: calc(var(--vp-nav-height) + 48px) 24px 48px;
}
@media (min-width: 640px) {
  .DocsHero {
    padding-inline: 48px;
  }
}
@media (min-width: 960px) {
  .DocsHero {
    grid-template-columns: minmax(0, 1fr) minmax(0, 540px);
    align-items: center;
    gap: 56px;
    padding: calc(var(--vp-nav-height) + 64px) 64px 64px;
    max-width: calc(1104px + 128px);
  }
}

h1 {
  margin: 0;
  font: 600 40px/44px var(--sans);
  letter-spacing: -0.025em;
  color: var(--fg);
}
.tagline {
  max-width: 34em;
  margin: 16px 0 0;
  font-size: 17px;
  line-height: 28px;
  color: var(--muted);
  text-wrap: balance;
}

.search-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 480px;
  height: 44px;
  margin-top: 28px;
  padding: 0 10px 0 14px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: var(--card);
  color: var(--subtle);
  font: 400 15px/1 var(--sans);
  transition:
    border-color 150ms var(--ease),
    color 150ms var(--ease),
    transform 120ms var(--ease);
}
.search-trigger .label {
  flex: 1;
  text-align: start;
}
.keys {
  display: inline-flex;
  gap: 3px;
}
kbd {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  display: inline-grid;
  place-items: center;
  font: 500 12px/1 var(--sans);
  color: var(--subtle);
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 6px;
}
@media (hover: hover) {
  .search-trigger:hover {
    color: var(--muted);
    border-color: var(--subtle);
  }
}
.search-trigger:active {
  transform: scale(0.99);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin: 20px 0 0;
  font: 500 14px/20px var(--sans);
}
.actions a {
  color: var(--muted);
  text-decoration: none;
  transition: color 150ms var(--ease);
}
.actions a.is-brand {
  color: var(--link);
}
@media (hover: hover) {
  .actions a:hover {
    color: var(--fg);
  }
}

.run {
  margin: 0;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--card);
  overflow: hidden;
}
figcaption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--line);
  font: 500 13px/1 var(--sans);
  color: var(--muted);
}
pre {
  margin: 0;
  padding: 16px;
  overflow-x: auto;
  font: 400 13px/22px var(--mono);
  color: var(--fg);
}
.note {
  margin: 0;
  padding: 0 16px 16px;
  font-size: 13px;
  line-height: 20px;
  color: var(--subtle);
}
.note code {
  font: 400 12px var(--mono);
  color: var(--muted);
}

.copy {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: var(--subtle);
  transition:
    color 150ms var(--ease),
    background-color 150ms var(--ease);
}
.copy > svg {
  grid-area: 1 / 1;
  transition:
    opacity 150ms var(--ease),
    transform 150ms var(--ease);
}
.i-check,
.copy.done .i-copy {
  opacity: 0;
  transform: scale(0.8);
}
.copy.done {
  color: var(--good);
}
.copy.done .i-check {
  opacity: 1;
  transform: none;
}
@media (hover: hover) {
  .copy:hover {
    color: var(--fg);
    background: var(--raised);
  }
}
@media (prefers-reduced-motion: reduce) {
  .copy > svg {
    transition: opacity 120ms linear;
  }
  .i-check,
  .copy.done .i-copy,
  .search-trigger:active {
    transform: none;
  }
}
</style>
