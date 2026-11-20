import type { HeadConfig, SiteConfig, TransformContext } from 'vitepress'
import { SITE_URL } from './site'

export const head: HeadConfig[] = [
  ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
  ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
  ['meta', { name: 'theme-color', content: '#000000' }],
  ['meta', { property: 'og:site_name', content: 'Trail' }],
  ['meta', { property: 'og:image', content: `${SITE_URL}/og.png` }],
  ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ['link', { rel: 'alternate', type: 'application/rss+xml', title: 'Trail changelog', href: '/changelog.xml' }],
]

export function transformHead(ctx: TransformContext): HeadConfig[] {
  const { pageData } = ctx
  const path = pageData.relativePath.replace(/(^|\/)index\.md$/, '').replace(/\.md$/, '')
  const canonical = path ? `${SITE_URL}/docs/${path}` : `${SITE_URL}/docs`
  const md = `/docs/${pageData.relativePath}`
  return [
    ['link', { rel: 'canonical', href: canonical }],
    ['meta', { property: 'og:title', content: pageData.frontmatter.title ?? pageData.title }],
    ['meta', { property: 'og:description', content: pageData.frontmatter.description ?? pageData.description }],
    ['meta', { property: 'og:url', content: canonical }],
    ['link', { rel: 'alternate', type: 'text/markdown', href: md }],
  ]
}

export const sitemap: SiteConfig['sitemap'] = {
  hostname: SITE_URL + '/',
  transformItems: (items) => [{ url: '' }, ...items.map((i) => ({ ...i, url: 'docs/' + i.url }))],
}
