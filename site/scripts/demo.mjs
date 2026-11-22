// Builds the public dashboard demo into dist/demo, so trail.karanjot.co.in/demo ships with the landing and docs.
// The demo is web/ in fixtures mode (`pnpm build:demo` into web/dist-demo: recorded JSON, no server, Vite base /demo/).
// The recording (web/demo-data, gitignored) is made with `pnpm fixtures`, which runs the Go recorder; when Go is
// missing (a fresh Vercel build), the toolchain named in go.mod is downloaded into node_modules/.cache first.
// Set TRAIL_DEMO_RECORD=1 to record again even when web/demo-data exists.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { arch, platform } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const site = fileURLToPath(new URL('..', import.meta.url))
const root = join(site, '..')
const web = join(root, 'web')
const run = (cmd, args, env = process.env) => execFileSync(cmd, args, { cwd: web, stdio: 'inherit', env })
const works = (cmd, env) => {
  try {
    execFileSync(cmd, ['version'], { stdio: 'ignore', env })
    return true
  } catch {
    return false
  }
}

/** PATH with a Go toolchain on it: the one installed, else the go.mod version downloaded once. */
function goEnv() {
  if (works('go', process.env)) return process.env
  const mod = readFileSync(join(root, 'go.mod'), 'utf8')
  const ver = (/^toolchain go(\S+)/m.exec(mod) ?? /^go (\S+)/m.exec(mod))[1]
  const os = { darwin: 'darwin', linux: 'linux' }[platform()]
  const cpu = { x64: 'amd64', arm64: 'arm64' }[arch()]
  if (!os || !cpu) throw new Error(`demo: no Go download for ${platform()}/${arch()}; install Go ${ver}`)
  const dir = join(site, 'node_modules/.cache/go', ver)
  const bin = join(dir, 'go/bin')
  if (!existsSync(join(bin, 'go'))) {
    console.log(`demo: downloading Go ${ver} (${os}-${cpu})`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    execFileSync('sh', ['-c', `curl -fsSL "https://go.dev/dl/go${ver}.${os}-${cpu}.tar.gz" | tar -xz -C "${dir}"`], { stdio: 'inherit' })
  }
  return { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` }
}

if (!existsSync(join(web, 'node_modules'))) run('pnpm', ['install', '--frozen-lockfile'])
if (process.env.TRAIL_DEMO_RECORD === '1' || !existsSync(join(web, 'demo-data/index.json'))) run('pnpm', ['fixtures'], goEnv())
run('pnpm', ['build:demo'])

const out = join(site, 'dist/demo')
rmSync(out, { recursive: true, force: true })
cpSync(join(web, 'dist-demo'), out, { recursive: true })
rmSync(join(out, '.vite'), { recursive: true, force: true }) // the build manifest is for web's budget script only
console.log('demo: dist/demo ready')
