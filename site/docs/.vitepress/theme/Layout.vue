<script setup lang="ts">
import DefaultTheme from 'vitepress/theme-without-fonts'
import { useRoute } from 'vitepress'
import PageHeader from './PageHeader.vue'
import DocFeedback from './DocFeedback.vue'
import TrailFooter from './TrailFooter.vue'

const { Layout } = DefaultTheme
const route = useRoute()
</script>

<template>
  <Layout>
    <template #doc-before><PageHeader /></template>
    <template #doc-footer-before><DocFeedback :key="route.path" /></template>
    <template #layout-bottom><TrailFooter /></template>
  </Layout>
</template>

<style>
/* Local search modal (VPLocalSearchBox is teleported, so these are global).
   640px shell 15vh from the top; 56px rows with a one-line excerpt. */
@media (min-width: 48rem) {
  .VPLocalSearchBox .shell {
    width: min(100vw - 32px, 640px) !important;
    margin: 15vh auto auto !important;
    max-height: min(70vh, 600px) !important;
    padding: 8px !important;
    gap: 8px !important;
  }
}
.VPLocalSearchBox .search-bar {
  height: 44px;
}
.VPLocalSearchBox .result {
  border-width: 1px !important;
}
.VPLocalSearchBox .result > div {
  margin: 7px 12px !important;
}
.VPLocalSearchBox .titles {
  padding: 0 !important;
  gap: 2px 6px;
  font: 500 14px/20px var(--sans);
  color: var(--fg);
}
.VPLocalSearchBox .titles .title:not(.main) {
  font-weight: 400;
  color: var(--subtle);
}
.VPLocalSearchBox .result .title-icon {
  display: none;
}
.VPLocalSearchBox .results .result.selected .titles {
  color: var(--fg) !important;
}
.VPLocalSearchBox .titles .local-search-icon {
  font-size: 12px;
  opacity: 0.6;
}
.VPLocalSearchBox .excerpt-wrapper .excerpt {
  max-height: 20px;
  margin-top: 2px;
  opacity: 1;
}
.VPLocalSearchBox .excerpt .vp-doc,
.VPLocalSearchBox .excerpt .vp-doc * {
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: none !important;
  box-shadow: none !important;
  font: 400 13px/20px var(--sans) !important;
  color: var(--muted) !important;
  text-decoration: none !important;
}
.VPLocalSearchBox .excerpt .vp-doc :is(table, thead, tbody, tr, th, td) {
  display: block;
}
.VPLocalSearchBox .excerpt .vp-doc :is(button, .lang, .tabs, .header-anchor) {
  display: none !important;
}
.VPLocalSearchBox .excerpt-gradient-top,
.VPLocalSearchBox .excerpt-gradient-bottom {
  display: none;
}
.VPLocalSearchBox .titles mark,
.VPLocalSearchBox .excerpt .vp-doc mark {
  padding: 0 1px !important;
  border-radius: 3px;
  background: color-mix(in srgb, var(--accent) 18%, transparent) !important;
  color: var(--fg) !important;
  font-weight: inherit;
}
</style>
