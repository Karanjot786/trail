/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Per-worktree dev wiring: VITE_PORT picks the dev port, TRAIL_API the Go server to proxy to.
const api = process.env.TRAIL_API ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  test: { environment: 'happy-dom', exclude: ['**/node_modules/**', 'e2e/**', 'design-system/**'] },
})
