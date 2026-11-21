/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync, readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

// `pnpm fixtures` records into web/demo-data (kept out of public/, so the Go binary never embeds it).
// The dev server serves it at /demo-data; `pnpm build:demo` copies it into dist/demo-data.
const demoData = (): Plugin => ({
  name: 'trail-demo-data',
  configureServer(server) {
    server.middlewares.use('/demo-data', (req, res, next) => {
      const file = new URL(`./demo-data${(req.url ?? '/').split('?')[0]}`, import.meta.url).pathname
      if (!file.includes('/demo-data/') || file.includes('..') || !existsSync(file)) return next()
      res.setHeader('content-type', 'application/json')
      res.end(readFileSync(file))
    })
  },
})

// Per-worktree dev wiring: VITE_PORT picks the dev port, TRAIL_API the Go server to proxy to.
const api = process.env.TRAIL_API ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react(), tailwindcss(), demoData()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '@ds': new URL('./design-system/dist', import.meta.url).pathname,
    },
  },
  // dist/.keep is restored by scripts/keep.mjs after the build empties the dir.
  // The manifest feeds the performance budget script.
  build: { outDir: 'dist', emptyOutDir: true, manifest: true },
  server: {
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': api,
      '/_t': api,
    },
  },
  test: { environment: 'happy-dom', setupFiles: ['src/test-setup.ts'], testTimeout: 20_000, exclude: ['**/node_modules/**', 'e2e/**', 'design-system/**'] },
})
