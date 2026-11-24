// Real-framework smoke: `node smoke/run.mjs [next15|next16|astro|all]`.
// For each target: npm pack -> copy a fixture to a temp dir -> install the framework and the tarball
// -> `trail-analytics init --yes` -> build -> start -> drive it with crawler and browser requests
// against the mock Trail (smoke/mock-trail.mjs) -> kill everything and delete the temp dir.
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUB_JS, startMock } from './mock-trail.mjs';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOCK = 8303;
const TOKEN = 'tk_smoke_0123456789';
const SITE = 'demo';
const TRAIL = `http://127.0.0.1:${MOCK}`;
const GPT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)';
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const TARGETS = {
  next15: { fixture: 'next15-app', port: 3301, hook: 'middleware.ts', status: 0, build: ['npx', ['next', 'build']], start: (p) => ['npx', ['next', 'start', '-p', String(p), '-H', '127.0.0.1']] },
  next16: { fixture: 'next16-app', port: 3302, hook: 'proxy.ts', status: 0, build: ['npx', ['next', 'build']], start: (p) => ['npx', ['next', 'start', '-p', String(p), '-H', '127.0.0.1']] },
  astro: { fixture: 'astro-ssr', port: 3303, hook: 'astro.config.mjs', status: 200, build: ['npx', ['astro', 'build']], start: () => ['node', ['dist/server/entry.mjs']] },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[smoke]', ...a);

async function until(fn, ms = 3000, step = 100) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return v;
    await sleep(step);
  }
}

function run(cmd, args, cwd, env = {}) {
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...env }, maxBuffer: 64 << 20 });
}

async function target(name, tarball, mock) {
  const t = TARGETS[name];
  const dir = mkdtempSync(join(process.env.SMOKE_TMP ?? tmpdir(), `trail-smoke-${name}-`));
  const fails = [];
  const check = (ok, what) => (ok ? log(`  ok   ${what}`) : (fails.push(what), log(`  FAIL ${what}`)));
  let app;
  const res = { name, buildMs: 0, lines: 0 };
  try {
    cpSync(join(PKG, 'test/fixtures', t.fixture), dir, { recursive: true });
    log(`${name}: install in ${dir}`);
    run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', tarball], dir);
    const ver = JSON.parse(readFileSync(join(dir, `node_modules/${name === 'astro' ? 'astro' : 'next'}/package.json`), 'utf8')).version;
    log(`${name}: framework ${ver}`);
    run('node', [join(dir, 'node_modules/trail-analytics/dist/cli.js'), 'init', '--url', TRAIL, '--site', SITE, '--token', TOKEN, '--yes', '--no-install', '--cwd', dir], dir);
    log(`${name}: init wrote\n${readFileSync(join(dir, t.hook), 'utf8')}`);
    const t0 = Date.now();
    run(t.build[0], t.build[1], dir, { NEXT_TELEMETRY_DISABLED: '1', ASTRO_TELEMETRY_DISABLED: '1' });
    res.buildMs = Date.now() - t0;
    check(true, `build exits 0 (${res.buildMs} ms, ${name} ${ver})`);

    const [cmd, args] = t.start(t.port);
    // Next reads .env.local itself; the Astro node server gets the env the way a host would set it.
    const env = { ...process.env, PORT: String(t.port), HOST: '127.0.0.1', NEXT_TELEMETRY_DISABLED: '1', ...(name === 'astro' ? { TRAIL_URL: TRAIL, TRAIL_SITE: SITE, TRAIL_CRAWL_TOKEN: TOKEN } : {}) };
    app = spawn(cmd, args, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let out = '';
    app.stdout.on('data', (d) => (out += d));
    app.stderr.on('data', (d) => (out += d));
    const base = `http://127.0.0.1:${t.port}`;
    const up = await until(() => fetch(base + '/').then((r) => r.status < 500, () => false), 60000, 300);
    if (!up) throw new Error(`${name} did not start:\n${out}`);
    mock.state.crawls.length = 0;
    mock.state.beacons.length = 0;
    mock.state.total = 0;

    const lines = () => mock.state.crawls;
    // 1. a crawler page view
    await fetch(base + '/', { headers: { 'user-agent': GPT } });
    await until(() => lines().length >= 1);
    await sleep(300);
    check(lines().length === 1 && lines()[0].line.path === '/' && lines()[0].ok && lines()[0].site === SITE, `GPTBot GET / sends exactly one line (got ${lines().length})`);
    check(lines()[0]?.line.status === t.status, `line status is ${t.status} (got ${lines()[0]?.line.status})`);
    // 2. a person
    lines().length = 0;
    const html = await (await fetch(base + '/', { headers: { 'user-agent': CHROME } })).text();
    await sleep(1000);
    check(lines().length === 0, 'Chrome GET / sends no line');
    if (name === 'astro') check(html.includes('/t/t.js') && html.includes(JSON.stringify(SITE)) && html.includes('/t/e'), 'page carries the first-party script loader');
    // 3. robots.txt
    await fetch(base + '/robots.txt', { headers: { 'user-agent': GPT } });
    await until(() => lines().length >= 1);
    check(lines().length === 1 && lines()[0].line.path === '/robots.txt', 'GPTBot GET /robots.txt sends one line');
    // 4. the tracker, first-party
    lines().length = 0;
    const js = await fetch(base + '/t/t.js', { headers: { 'user-agent': CHROME } });
    check(js.status === 200 && (await js.text()) === STUB_JS, 'GET /t/t.js is served from Trail');
    // 5. a beacon, signed
    const body = JSON.stringify([{ s: SITE, n: 'pageview', u: base + '/' }]);
    const b = await fetch(base + '/t/e', { method: 'POST', body, headers: { 'content-type': 'text/plain;charset=UTF-8', 'user-agent': CHROME, origin: base, 'x-vercel-id': 'smoke::1', 'x-real-ip': '203.0.113.7' } });
    await until(() => mock.state.beacons.length >= 1);
    const got = mock.state.beacons[0];
    check(b.status === 202 && got?.verdict === '' && got.body === body, `POST /t/e reaches Trail signed, body intact (status ${b.status}, verdict "${got?.verdict}")`);
    check(got?.headers['x-trail-ip'] === '203.0.113.7' && got?.headers['x-trail-host'] === `127.0.0.1:${t.port}`, 'X-Trail-IP and X-Trail-Host are set');
    check(!JSON.stringify(got?.headers ?? {}).includes(TOKEN), 'the token is never forwarded');
    // 6. a signed agent with a browser UA
    await fetch(base + '/', { headers: { 'user-agent': CHROME, 'signature-agent': '"https://chatgpt.com"', 'signature-input': 'sig1=("@authority");created=1', signature: 'sig1=:AA==:' } });
    await until(() => lines().length >= 1);
    check(lines()[0]?.line.sa === '"https://chatgpt.com"' && lines()[0]?.line.si && lines()[0]?.line.sig, 'signature-agent request sends a line carrying sa/si/sig');
    res.lines = mock.state.total;
  } catch (e) {
    fails.push(String(e?.message ?? e).slice(0, 2000));
    log(`  FAIL ${fails[fails.length - 1]}`);
  } finally {
    if (app?.pid) {
      try {
        process.kill(-app.pid, 'SIGTERM');
      } catch {}
      await sleep(500);
      try {
        process.kill(-app.pid, 'SIGKILL');
      } catch {}
    }
    if (!process.env.SMOKE_KEEP) rmSync(dir, { recursive: true, force: true });
  }
  return { ...res, fails };
}

const which = process.argv[2] ?? 'all';
const names = which === 'all' ? Object.keys(TARGETS) : [which];
if (!names.every((n) => TARGETS[n])) {
  console.error(`usage: node smoke/run.mjs [${Object.keys(TARGETS).join('|')}|all]`);
  process.exit(1);
}
const packDir = mkdtempSync(join(tmpdir(), 'trail-pack-'));
const tgz = execFileSync('npm', ['pack', '--silent', '--pack-destination', packDir], { cwd: PKG, encoding: 'utf8' }).trim().split('\n').pop();
const tarball = join(packDir, tgz);
const mock = await startMock({ port: MOCK, token: TOKEN, site: SITE });
const results = [];
try {
  for (const n of names) results.push(await target(n, tarball, mock));
} finally {
  await mock.close();
  rmSync(packDir, { recursive: true, force: true });
}
console.log('\nsummary');
for (const r of results) console.log(`  ${r.fails.length ? 'FAIL' : 'PASS'} ${r.name}: build ${r.buildMs} ms, ${r.lines} lines received${r.fails.length ? ' | ' + r.fails.join('; ') : ''}`);
process.exit(results.some((r) => r.fails.length) ? 1 : 0);
