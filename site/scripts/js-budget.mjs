import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import net from 'node:net'

const PAGES = [{ path: '/', limit: 15360 }, { path: '/docs/quickstart', limit: 92160 }]
const PORT = 4173
const free = await new Promise((res) => {
  const s = net.createServer().once('error', () => res(false)).once('listening', () => s.close(() => res(true)))
  s.listen(PORT, '127.0.0.1')
})
const server = free ? spawn('npx', ['serve@14.2.8', 'dist', '-l', `tcp://127.0.0.1:${PORT}`], { stdio: 'ignore' }) : null
if (server) await new Promise((r) => setTimeout(r, 4000))

let failed = false
try {
  const browser = await chromium.launch()
  for (const { path, limit } of PAGES) {
    const page = await browser.newPage()
    const jobs = []
    page.on('response', (r) => {
      const url = r.url()
      if (!/\.js(\?|$)/.test(url) && !(r.headers()['content-type'] || '').includes('javascript')) return
      jobs.push(r.body().then((b) => ({ url: url.replace(/^https?:\/\/[^/]+/, ''), gz: gzipSync(b, { level: 9 }).length }), () => null))
    })
    await page.goto(`http://127.0.0.1:${PORT}${path}`, { waitUntil: 'networkidle' })
    const rows = (await Promise.all(jobs)).filter(Boolean)
    await page.close()
    let total = 0
    for (const r of rows) { total += r.gz; console.log(String(r.gz).padStart(8), r.url) }
    console.log(`${path} total ${total} B gz (${(total / 1024).toFixed(1)} KB), limit ${limit}`)
    if (total > limit) failed = true
  }
  await browser.close()
} finally {
  server?.kill()
}
process.exit(failed ? 1 : 0)
