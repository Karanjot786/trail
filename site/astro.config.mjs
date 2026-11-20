import { defineConfig } from 'astro/config';
import { SITE_URL } from './src/config.ts';

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'always' },
  // IPv4 loopback: Node may bind 'localhost' to ::1 only, which Firefox can't reach via localhost.
  server: { host: '127.0.0.1' },
  // In dev, /docs is served by VitePress (scripts/dev.mjs starts it on :5173).
  // Fonts are preloaded by URL, so Vite must never inline them as data: URIs (Doto is 2 KB).
  vite: { build: { assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined) }, server: { fs: { allow: ['..'] }, proxy: { '/docs': { target: 'http://127.0.0.1:5173', ws: true } } } },
});
