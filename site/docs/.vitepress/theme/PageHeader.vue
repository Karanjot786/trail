<script setup lang="ts">
// Row above the H1: breadcrumbs on the left, "Copy page ▾" split button on
// the right. The menu follows the APG menu-button pattern.
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useData, withBase } from 'vitepress'
import { sidebar } from '../sidebar'
import { SITE_URL } from '../site'

const { page } = useData()
const mdHref = computed(() => withBase('/' + page.value.relativePath))
const section = computed(() => {
  const link = '/' + page.value.relativePath.replace(/(index)?\.md$/, '')
  const group = (sidebar as { text?: string; items?: { link?: string }[] }[]).find((g) => g.items?.some((i) => i.link === link))
  return group?.text ?? 'Docs'
})
const ask = computed(() => encodeURIComponent(`Read ${SITE_URL}/docs/${page.value.relativePath} and answer my questions about it.`))

// ---- copy ----
const LABEL = { idle: 'Copy page', done: 'Copied', fail: 'Copy failed' }
const state = ref<keyof typeof LABEL>('idle')
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  clearTimeout(timer)
  const text = fetch(mdHref.value).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
  try {
    // Safari only allows the write inside the click, so hand it the pending fetch.
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })])
    } catch {
      await navigator.clipboard.writeText(await text)
    }
    state.value = 'done'
  } catch {
    state.value = 'fail'
  }
  timer = setTimeout(() => (state.value = 'idle'), 1500)
}

// ---- menu ----
const open = ref(false)
const toggle = ref<HTMLButtonElement>()
const menu = ref<HTMLElement>()
const items = () => [...(menu.value?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]

async function show(focus: 'first' | 'last' = 'first') {
  open.value = true
  document.addEventListener('pointerdown', onOutside, true)
  await nextTick()
  const all = items()
  all[focus === 'first' ? 0 : all.length - 1]?.focus()
}
function hide(returnFocus = true) {
  if (!open.value) return
  open.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  if (returnFocus) toggle.value?.focus()
}
function onOutside(e: PointerEvent) {
  const t = e.target as Node
  if (!menu.value?.contains(t) && !toggle.value?.contains(t)) hide(false)
}
function onToggleKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    show(e.key === 'ArrowDown' ? 'first' : 'last')
  }
}
function onMenuKey(e: KeyboardEvent) {
  const all = items()
  const i = all.indexOf(document.activeElement as HTMLElement)
  const go = (n: number) => all[(n + all.length) % all.length]?.focus()
  if (e.key === 'ArrowDown') go(i + 1)
  else if (e.key === 'ArrowUp') go(i - 1)
  else if (e.key === 'Home') go(0)
  else if (e.key === 'End') go(-1)
  else if (e.key === 'Escape') hide()
  else if (e.key === 'Tab') return hide(false)
  else return
  e.preventDefault()
}
onBeforeUnmount(() => {
  clearTimeout(timer)
  document.removeEventListener('pointerdown', onOutside, true)
})
</script>

<template>
  <div class="PageHeader">
    <nav class="crumbs" aria-label="Breadcrumb">
      <ol>
        <li>{{ section }}</li>
        <li aria-current="page">{{ page.title }}</li>
      </ol>
    </nav>

    <div class="split">
      <button type="button" class="copy" :data-state="state" @click="copy">
        <span class="icon" aria-hidden="true">
          <svg class="i-copy" viewBox="0 0 16 16" width="14" height="14"><rect x="5" y="5" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
          <svg class="i-check" viewBox="0 0 16 16" width="14" height="14"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        <span aria-live="polite">{{ LABEL[state] }}</span>
      </button>
      <button
        ref="toggle"
        type="button"
        class="menu-toggle"
        aria-label="More copy options"
        aria-haspopup="menu"
        aria-controls="page-copy-menu"
        :aria-expanded="open"
        @click="open ? hide() : show()"
        @keydown="onToggleKey"
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>

      <Transition name="menu">
        <div v-show="open" id="page-copy-menu" ref="menu" class="menu" role="menu" aria-label="Copy page" @keydown="onMenuKey">
          <button type="button" role="menuitem" tabindex="-1" @click="copy(); hide()">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
            Copy as Markdown
          </button>
          <a role="menuitem" tabindex="-1" :href="mdHref" target="_self" @click="hide(false)">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 1.5h5.5L13 5v9.5H4z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.5 1.5V5H13" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
            View as Markdown
          </a>
          <a role="menuitem" tabindex="-1" :href="'https://chatgpt.com/?q=' + ask" target="_blank" rel="noopener" @click="hide(false)">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 2.5a5.5 5.5 0 1 1-4.6 8.5L2.5 13.5l2.6-.8A5.5 5.5 0 0 0 8 13.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Open in ChatGPT
            <svg class="ext" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 4h6v6M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
          <a role="menuitem" tabindex="-1" :href="'https://claude.ai/new?q=' + ask" target="_blank" rel="noopener" @click="hide(false)">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 2v12M2 8h12M3.8 3.8l8.4 8.4M12.2 3.8l-8.4 8.4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            Open in Claude
            <svg class="ext" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 4h6v6M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.PageHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 32px;
  margin-bottom: 20px;
}
.crumbs {
  min-width: 0;
}
.crumbs ol {
  display: flex;
  flex-wrap: wrap;
  margin: 0;
  padding: 0;
  list-style: none;
  font: 400 13px/20px var(--sans);
  color: var(--subtle);
}
.crumbs li + li::before {
  content: '/';
  padding-inline: 8px;
  color: var(--line-strong);
}
.crumbs [aria-current] {
  color: var(--muted);
}

.split {
  position: relative;
  flex: none;
  display: flex;
  height: 32px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
}
.split > button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  color: var(--muted);
  font: 500 13px/1 var(--sans);
  white-space: nowrap;
  transition:
    color 150ms var(--ease),
    background-color 150ms var(--ease);
}
.copy {
  padding: 0 10px;
  border-radius: 7px 0 0 7px;
}
.menu-toggle {
  justify-content: center;
  width: 30px;
  border-left: 1px solid var(--line);
  border-radius: 0 7px 7px 0;
}
.menu-toggle[aria-expanded='true'] {
  color: var(--fg);
  background: var(--raised);
}
@media (hover: hover) {
  .split > button:hover {
    color: var(--fg);
    background: var(--raised);
  }
}
.copy[data-state='done'] {
  color: var(--good);
}

/* Copy icon swaps to a check in place. */
.icon {
  display: grid;
}
.icon > svg {
  grid-area: 1 / 1;
  transition:
    opacity 150ms var(--ease),
    transform 150ms var(--ease);
}
.i-check,
.copy[data-state='done'] .i-copy {
  opacity: 0;
  transform: scale(0.8);
}
.copy[data-state='done'] .i-check {
  opacity: 1;
  transform: none;
}

.menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  right: -1px;
  width: 224px;
  padding: 4px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: var(--card);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.5);
  transform-origin: top right;
}
.menu [role='menuitem'] {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  color: var(--muted);
  font: 400 13px/1 var(--sans);
  text-decoration: none;
  text-align: start;
  outline: none;
}
.menu [role='menuitem']:focus {
  color: var(--fg);
  background: var(--raised);
  box-shadow: inset 0 0 0 1px var(--line-strong);
}
@media (hover: hover) {
  .menu [role='menuitem']:hover {
    color: var(--fg);
    background: var(--raised);
  }
}
.menu .ext {
  margin-inline-start: auto;
  color: var(--subtle);
}

.menu-enter-active {
  transition:
    opacity 150ms var(--ease),
    transform 150ms var(--ease);
}
.menu-leave-active {
  transition: opacity 100ms var(--ease);
}
.menu-enter-from {
  opacity: 0;
  transform: scale(0.98);
}
.menu-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .icon > svg,
  .menu-enter-active {
    transition: opacity 120ms linear;
  }
  .i-check,
  .copy[data-state='done'] .i-copy,
  .menu-enter-from {
    transform: none;
  }
}
</style>
