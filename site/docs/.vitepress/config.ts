import { fileURLToPath } from 'node:url'
import { defineConfig, type DefaultTheme } from 'vitepress'
import { DOCS_BASE, GITHUB_URL } from './site'
import { sidebar } from './sidebar'
import { head, transformHead, sitemap } from './seo'
import { llms } from './llms'

export default defineConfig<DefaultTheme.Config>({
  base: DOCS_BASE,
  outDir: '../dist/docs',
  cleanUrls: true,
  appearance: 'force-dark',
  lang: 'en-US',
  title: 'Trail docs',
  titleTemplate: ':title · Trail docs',
  description: 'Install, configure and run Trail, self-hosted web analytics that shows the whole visitor journey.',
  lastUpdated: false, // owner decision: off
  head,
  transformHead,
  sitemap,
  markdown: { theme: 'github-dark-default', codeCopyButton: { tooltipText: 'Copy code' }, image: { lazyLoad: true } },
  vite: {
    plugins: llms(),
    server: { host: '127.0.0.1' },
    resolve: {
      alias: [{ find: /^.*\/VPNavBar\.vue$/, replacement: fileURLToPath(new URL('./theme/TrailNavBar.vue', import.meta.url)) }],
    },
  },
  themeConfig: {
    sidebar,
    outline: { level: [2, 3], label: 'On this page' },
    editLink: { pattern: GITHUB_URL + '/edit/main/site/docs/:path', text: 'Edit this page on GitHub' },
    docFooter: { prev: 'Previous', next: 'Next' },
    search: {
      provider: 'local',
      options: { miniSearch: { searchOptions: { fuzzy: 0.2, prefix: true, boost: { title: 4, text: 2, titles: 1 } } } },
    },
  },
})
