<script setup lang="ts">
// "Was this helpful?" sent as a Trail custom event (dogfooding the tracker).
// Layout.vue keys this by route, so every page starts unvoted.
import { nextTick, ref } from 'vue'
import { useRoute } from 'vitepress'

declare global {
  interface Window {
    trail?: { track?: (name: string, props?: Record<string, string>) => void }
  }
}

const route = useRoute()
const voted = ref(false)
const thanks = ref<HTMLElement>()

async function vote(helpful: 'yes' | 'no') {
  window.trail?.track?.('Docs feedback', { page: route.path, helpful })
  voted.value = true
  await nextTick()
  thanks.value?.focus()
}
</script>

<template>
  <div class="DocFeedback">
    <p v-if="voted" ref="thanks" class="thanks" tabindex="-1" role="status">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="var(--good)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Thanks for the feedback.
    </p>
    <template v-else>
      <p id="doc-feedback-q">Was this helpful?</p>
      <div role="group" aria-labelledby="doc-feedback-q">
        <button type="button" @click="vote('yes')">Yes</button>
        <button type="button" @click="vote('no')">No</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.DocFeedback {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 32px;
  margin-bottom: 24px;
  font: 400 14px/20px var(--sans);
  color: var(--muted);
}
p {
  margin: 0;
}
.thanks {
  display: flex;
  align-items: center;
  gap: 8px;
  outline: none;
  color: var(--fg);
}
div[role='group'] {
  display: flex;
  gap: 8px;
}
button {
  height: 32px;
  min-width: 52px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--muted);
  font: 500 13px/1 var(--sans);
  transition:
    color 150ms var(--ease),
    background-color 150ms var(--ease),
    border-color 150ms var(--ease),
    transform 120ms var(--ease);
}
@media (hover: hover) {
  button:hover {
    color: var(--fg);
    background: var(--raised);
    border-color: var(--line-strong);
  }
}
button:active {
  transform: scale(0.97);
}
@media (prefers-reduced-motion: reduce) {
  button:active {
    transform: none;
  }
}
</style>
