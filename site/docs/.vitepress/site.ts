export { SITE_URL, GITHUB_URL, DEMO_URL, NPM_URL } from '../../src/config'
export const DOCS_BASE = '/docs/'
export const isDocsPath = (pathname: string): boolean => pathname === '/docs' || pathname.startsWith('/docs/')
