import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { request } from '@playwright/test'

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = resolve(webDir, '..')

export const E2E_PASSWORD = 'e2e'
export const E2E_SITES = 'demo=demo.trail.dev,docs=docs.trail.dev'

/** Builds the dashboard (if needed) and the Go binary, seeds a temp DB, starts `trail serve`, logs in. Returns the teardown. */
export default async function globalSetup() {
  const port = Number(process.env.E2E_PORT ?? 8120)
  const base = `http://127.0.0.1:${port}`
  const tmp = mkdtempSync(join(tmpdir(), 'trail-e2e-'))
  const bin = join(tmp, 'trail')
  const db = join(tmp, 'e2e.db')

  if (!process.env.E2E_SKIP_BUILD && !existsSync(join(webDir, 'dist', 'index.html'))) {
    execFileSync('pnpm', ['build'], { cwd: webDir, stdio: 'inherit' })
  }
  execFileSync('go', ['build', '-o', bin, './cmd/trail'], { cwd: repoDir, stdio: 'inherit' })

  const env = { ...process.env, TRAIL_DB: db, TRAIL_SITES: E2E_SITES, TRAIL_PASSWORD: E2E_PASSWORD, TRAIL_ADDR: `:${port}`, TRAIL_AGENT_LISTS: 'off', TRAIL_TZ: 'Asia/Kolkata' }
  try {
    execFileSync(bin, ['seed', '--sites', 'demo,docs', '--days', '60', '--persons', '1800', '--seed', '42', '--revenue', 'demo', '--crawlers', 'demo'], { cwd: repoDir, env, stdio: 'inherit' })
  } catch {
    // The seed flags land with builder B2 (task 9). Until then the plain seed fills the TRAIL_SITES sites.
    rmSync(db, { force: true })
    execFileSync(bin, ['seed'], { cwd: repoDir, env, stdio: 'inherit' })
  }

  const server: ChildProcess = spawn(bin, ['serve'], { cwd: repoDir, env, stdio: ['ignore', 'inherit', 'inherit'] })
  const stop = () => {
    if (server.exitCode === null) server.kill('SIGTERM')
    rmSync(tmp, { recursive: true, force: true })
  }
  process.once('exit', stop)

  const deadline = Date.now() + 30_000
  for (;;) {
    try {
      if ((await fetch(base + '/')).ok) break
    } catch {
      /* not up yet */
    }
    if (server.exitCode !== null) throw new Error(`trail serve exited with ${server.exitCode}`)
    if (Date.now() > deadline) {
      stop()
      throw new Error('trail serve did not start in 30 s')
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  mkdirSync(join(webDir, 'test-results'), { recursive: true })
  const ctx = await request.newContext({ baseURL: base })
  const res = await ctx.post('/api/login', { data: { password: E2E_PASSWORD } })
  if (res.status() !== 204) {
    stop()
    throw new Error(`login failed: ${res.status()}`)
  }
  await ctx.storageState({ path: join(webDir, 'test-results', '.auth.json') })
  await ctx.dispose()
  writeFileSync(join(webDir, 'test-results', '.e2e-base'), base)

  return async () => stop()
}
