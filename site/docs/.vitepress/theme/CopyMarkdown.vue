<script setup lang="ts">
// Copies this page's Markdown twin (written next to the HTML by the llms plugin).
import { computed, ref } from 'vue'
import { useData, withBase } from 'vitepress'

const { page } = useData()
const href = computed(() => withBase('/' + page.value.relativePath))
const LABELS = { idle: 'Copy page as Markdown', done: 'Copied', fail: 'Copy failed. Open the .md link instead' }
const state = ref<keyof typeof LABELS>('idle')
let timer: ReturnType<typeof setTimeout> | undefined

async function copy() {
  clearTimeout(timer)
  try {
    const res = await fetch(href.value)
    if (!res.ok) throw new Error(String(res.status))
    await navigator.clipboard.writeText(await res.text())
    state.value = 'done'
  } catch {
    state.value = 'fail'
  }
  timer = setTimeout(() => (state.value = 'idle'), 2000)
}
</script>

<template>
  <div class="CopyMarkdown">
    <button type="button" :data-state="state" @click="copy">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
      <span aria-live="polite">{{ LABELS[state] }}</span>
    </button>
    <a :href="href" target="_self">.md</a>
  </div>
</template>

<style scoped>
.CopyMarkdown {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  height: 32px;
  margin-bottom: 8px;
  font-size: 13px;
}
button,
a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--subtle);
  text-decoration: none;
  white-space: nowrap;
  font: 500 13px/1 var(--sans);
}
a {
  font-family: var(--mono);
}
button:active {
  transform: scale(0.97);
}
button[data-state='done'] {
  color: var(--good);
}
@media (hover: hover) {
  button:hover,
  a:hover {
    color: var(--fg);
    background: var(--raised);
  }
}
</style>
