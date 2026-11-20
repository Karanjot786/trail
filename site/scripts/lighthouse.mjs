import { execFileSync, spawn } from 'node:child_process'
import net from 'node:net'

const ci = process.argv.includes('--ci')
const PORT = 4173
const free = await new Promise((res) => {
  const s = net.createServer().once('error', () => res(false)).once('listening', () => s.close(() => res(true)))
  s.listen(PORT, '127.0.0.1')
})
const server = free ? spawn('npx', ['serve@14.2.8', 'dist', '-l', `tcp://127.0.0.1:${PORT}`], { stdio: 'ignore' }) : null
if (server) await new Promise((r) => setTimeout(r, 4000))

let failed = false
try {
  for (const path of ['/', '/docs/quickstart', '/docs/tracking/privacy']) {
    for (const preset of ['desktop', 'mobile']) {
      const args = ['-y', 'lighthouse@13.6.0', `http://127.0.0.1:${PORT}${path}`,
        '--only-categories=performance,accessibility,best-practices,seo', '--output=json', '--quiet',
        '--chrome-flags=--headless=new']
      if (preset === 'desktop') args.push('--preset=desktop')
      const out = execFileSync('npx', args, { maxBuffer: 64 << 20 }).toString()
      const c = JSON.parse(out).categories
      const s = { perf: c.performance.score, a11y: c.accessibility.score, bp: c['best-practices'].score, seo: c.seo.score }
      const home = path === '/'
      const perfMin = home ? (preset === 'desktop' ? 1 : 0.95) : preset === 'desktop' ? 0.95 : 0.9
      const bad = []
      if (s.a11y < (home ? 1 : 0.95)) bad.push(`a11y<${home ? 1 : 0.95}`)
      if (s.seo < 1) bad.push('seo<1')
      if (s.bp < 1) bad.push('best-practices<1')
      if (!ci && s.perf < perfMin) bad.push(`perf<${perfMin}`)
      console.log(`${bad.length ? 'FAIL' : 'ok  '} ${path} ${preset} perf=${s.perf} a11y=${s.a11y} bp=${s.bp} seo=${s.seo} ${bad.join(' ')}`)
      if (bad.length) failed = true
    }
  }
} finally {
  server?.kill()
}
process.exit(failed ? 1 : 0)
