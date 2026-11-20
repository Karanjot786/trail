<script setup lang="ts">
import DefaultTheme from 'vitepress/theme-without-fonts'
import CopyMarkdown from './CopyMarkdown.vue'
import TrailFooter from './TrailFooter.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #doc-before><CopyMarkdown /></template>
    <template #layout-bottom><TrailFooter /></template>
  </Layout>
</template>
