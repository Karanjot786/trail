import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const xml = readFileSync(fileURLToPath(new URL('../dist/docs/sitemap.xml', import.meta.url)), 'utf8')
const ORIGIN = 'https://trail.karanjot.dev'
export const pages = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1])
  .filter((u) => u.startsWith(ORIGIN + '/docs'))
  .map((u) => u.slice(ORIGIN.length).replace(/\/$/, ''))
