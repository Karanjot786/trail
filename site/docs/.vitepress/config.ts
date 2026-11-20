import { fileURLToPath } from 'node:url'
import { defineConfig, type DefaultTheme, type HeadConfig } from 'vitepress'
import { DEMO_URL, DOCS_BASE, GITHUB_URL, SITE_URL } from './site'
import { sidebar } from './sidebar'
import { head, transformHead, sitemap } from './seo'
import { llms } from './llms'
import { formatStars, getStars } from '../../src/lib/github-stars.mjs'

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
  // Dogfood: the docs run Trail when TRAIL_DOCS_SITE is set at build time (default, private-until-consent mode).
  head: process.env.TRAIL_DOCS_SITE
    ? [...head, ['script', { defer: '', src: '/_t/t.js', 'data-site': process.env.TRAIL_DOCS_SITE }] as HeadConfig]
    : head,
  transformHead,
  sitemap,
  markdown: { theme: 'github-dark-default', codeCopyButton: { tooltipText: 'Copy code' }, image: { lazyLoad: true } },
  vite: {
    plugins: llms(),
    server: { host: '127.0.0.1' },
    // src/config.ts reads process.env, which does not exist in the browser.
    define: {
      'process.env.SITE_URL': JSON.stringify(SITE_URL),
      'process.env.TRAIL_DEMO_URL': JSON.stringify(DEMO_URL),
      // GitHub star count for the header button, fetched once per build ('' = plain "Star").
      __TRAIL_STARS__: JSON.stringify(formatStars(await getStars())),
    },
    resolve: {
      alias: [
        { find: /^.*\/VPNavBar\.vue$/, replacement: fileURLToPath(new URL('./theme/TrailNavBar.vue', import.meta.url)) },
        { find: /^.*\/VPHomeHero\.vue$/, replacement: fileURLToPath(new URL('./theme/DocsHero.vue', import.meta.url)) },
      ],
    },
  },
  themeConfig: {
    sidebar,
    outline: { level: [2, 3], label: 'On this page' },
    editLink: { pattern: GITHUB_URL + '/edit/main/site/docs/:path', text: 'Edit this page on GitHub' },
    docFooter: { prev: 'Previous', next: 'Next' },
    search: {
      provider: 'local',
      options: {
        detailedView: true,
        miniSearch: { searchOptions: { fuzzy: 0.2, prefix: true, boost: { title: 4, text: 2, titles: 1 } } },
      },
    },
  },
})
