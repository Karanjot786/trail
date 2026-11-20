// One `npm run dev` for the whole site: VitePress docs on :5173, Astro landing on :4321.
// Astro proxies /docs/* to VitePress (astro.config.mjs), so http://127.0.0.1:4321 serves both.
// Astro 7 detaches into a background server when stdout is not a TTY, so its CLI exiting
// cleanly is not a failure; Ctrl+C stops VitePress and runs `astro dev stop`.
import { spawn, spawnSync } from 'node:child_process'

const run = (cmd) => spawn(cmd, { shell: true, stdio: 'inherit' })
const docs = run('npx vitepress dev docs --host 127.0.0.1 --port 5173 --strictPort')
const landing = run('npx astro dev')

let stopping = false
const stop = (code = 0) => {
  if (stopping) return
  stopping = true
  docs.kill('SIGTERM')
  landing.kill('SIGTERM')
  spawnSync('npx astro dev stop', { shell: true, stdio: 'ignore' }) // no-op if not backgrounded
  process.exit(code)
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
docs.on('exit', (c) => stop(c ?? 1)) // docs server died: stop everything
landing.on('exit', (c) => c && stop(c)) // only a failing exit; 0 means it went to background
