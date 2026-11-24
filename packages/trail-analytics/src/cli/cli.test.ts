// @vitest-environment node
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detect } from './detect';
import { renderDiff } from './diff';
import { main, type Io } from './index';
import { spawnOptions } from './apply';
import { nodeFs, plan } from './plan';

const FIX = resolve(__dirname, '../../test/fixtures');
const TOKEN = 'tk_live_0123456789abcdefWXYZ';
const ARGS = ['init', '--url', 'https://trail.example.com', '--site', 'shop', '--token', TOKEN];
const dirs: string[] = [];

function fixture(name: string): string {
  const d = mkdtempSync(join(tmpdir(), `trail-init-${name}-`));
  cpSync(join(FIX, name), d, { recursive: true });
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const okFetch = (async (u: any) => new Response('', { status: String(u).includes('/_t/t.js') ? 200 : 202 })) as unknown as typeof fetch;

function io(over: Partial<Io> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const spawn = vi.fn(async () => 0);
  const base: Io = {
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    isTTY: false,
    ask: async () => false,
    spawn,
    gitIgnored: () => false,
    gitTracked: () => false,
    env: {},
    readStdin: async () => '',
    askSecret: async () => '',
    pmVersion: () => undefined,
    fetch: okFetch,
  };
  return { io: { ...base, ...over }, out, err, spawn, text: () => out.join('') + err.join('') };
}

const read = (d: string, p: string) => readFileSync(join(d, p), 'utf8');
const run = (d: string, extra: string[] = [], o = io()) => main([...ARGS, '--cwd', d, ...extra], o.io).then((code) => ({ code, ...o }));

const URL_FLAGS = ['init', '--url', 'https://trail.example.com', '--site', 'shop'];
const runNoToken = (d: string, extra: string[] = [], o = io()) => main([...URL_FLAGS, '--cwd', d, ...extra], o.io).then((code) => ({ code, ...o }));

const hook = (name: 'proxy' | 'middleware', ts: boolean) =>
  [
    ...(ts ? ["import type { NextFetchEvent, NextRequest } from 'next/server';"] : []),
    "import trail from 'trail-analytics/next/proxy';",
    '',
    "// Reports AI crawlers to Trail and serves /t/t.js and /t/e first-party (signed, with your host's edge geo).",
    `export ${name === 'proxy' ? 'default ' : ''}function ${name}(${ts ? 'req: NextRequest, event: NextFetchEvent' : 'req, event'}) {`,
    '  return trail(req, event);',
    '}',
    '',
    "export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };",
    '',
  ].join('\n');

describe('init', () => {
  it('TestInitNext16Fresh', async () => {
    const d = fixture('next16-app');
    const r = await run(d, ['--yes', '--no-install']);
    expect(r.code).toBe(0);
    expect(read(d, 'proxy.ts')).toBe(hook('proxy', true));
    expect(existsSync(join(d, 'middleware.ts'))).toBe(false);
    const layout = read(d, 'app/layout.tsx');
    expect(layout).toContain("import { Analytics } from 'trail-analytics/next';\n\nexport const metadata");
    expect(layout).toContain('        {children}\n        <Analytics site="shop" src="/t/t.js" api="/t/e" />\n      </body>');
    expect(read(d, '.env.local')).toBe(`TRAIL_URL=https://trail.example.com\nTRAIL_SITE=shop\nTRAIL_CRAWL_TOKEN=${TOKEN}\n`);
    expect(r.text()).toContain('+++ b/proxy.ts');
    expect(r.text()).toContain('Done.');
  });

  it('TestInitNext15Middleware', async () => {
    const d = fixture('next15-app');
    const r = await run(d, ['--yes', '--no-install']);
    expect(r.code).toBe(0);
    expect(read(d, 'middleware.ts')).toBe(hook('middleware', true));
    expect(existsSync(join(d, 'proxy.ts'))).toBe(false);
  });

  it('TestInitNext16SrcJs', async () => {
    const d = fixture('next16-src-js');
    const r = await run(d, ['--yes', '--no-install']);
    expect(r.code).toBe(0);
    expect(read(d, 'src/proxy.js')).toBe(hook('proxy', false));
    const layout = read(d, 'src/app/layout.jsx');
    expect(layout).toContain("import './globals.css'\nimport { Analytics } from 'trail-analytics/next'\n");
    expect(layout).toContain('<body>{children}<Analytics site="shop" src="/t/t.js" api="/t/e" /></body>');
    expect(r.spawn).not.toHaveBeenCalled();
  });

  it('TestInitWrapsExistingProxy', async () => {
    const d = fixture('next16-existing-proxy');
    const r = await run(d, ['--yes', '--no-install']);
    expect(r.code).toBe(0);
    const after = read(d, 'proxy.ts');
    expect(after).toContain('export default withTrail(proxy);');
    expect(after).toContain("import { withTrail } from 'trail-analytics/next/proxy';");
    expect(after).toContain('function proxy(req: NextRequest) {');
    expect(after).not.toContain('config');
  });

  it('TestInitPagesRouterManual', async () => {
    const d = fixture('next15-pages');
    const before = read(d, 'pages/_app.tsx');
    const r = await run(d, ['--yes', '--no-install']);
    expect(r.code).toBe(2);
    expect(read(d, 'pages/_app.tsx')).toBe(before);
    expect(read(d, 'middleware.ts')).toBe(hook('middleware', true));
    expect(r.text()).toContain('pages/_app');
    expect(r.text()).toContain('<Analytics site="shop" src="/t/t.js" api="/t/e" />');
  });

  it('TestInitAstroSSR', async () => {
    const d = fixture('astro-ssr');
    const r = await run(d, ['--yes', '--no-install']);
    expect(r.code).toBe(0);
    const cfg = read(d, 'astro.config.mjs');
    expect(cfg).toContain("import node from '@astrojs/node';\nimport trail from 'trail-analytics/astro';\n");
    expect(cfg).toContain('integrations: [trail({ site: "shop" })],');
    expect(read(d, '.env')).toContain(`TRAIL_CRAWL_TOKEN=${TOKEN}`);
    expect(r.text()).not.toContain('Static Astro');
  });

  it('warns when the node adapter has no site (origin check)', async () => {
    const d = fixture('astro-ssr');
    writeFileSync(join(d, 'astro.config.mjs'), read(d, 'astro.config.mjs').replace(/  site: .*\n/, ''));
    const r = await run(d, ['--dry-run']);
    expect(r.text()).toContain('allowedDomains');
    const ok = await run(fixture('astro-ssr'), ['--dry-run']);
    expect(ok.text()).not.toContain('allowedDomains');
  });

  it('TestInitAstroStaticWarns', async () => {
    const d = fixture('astro-static');
    const r = await run(d, ['--yes', '--no-install']);
    expect(r.code).toBe(0);
    expect(read(d, 'astro.config.mjs')).toContain('export default defineConfig({ integrations: [trail({ site: "shop" })] });');
    expect(r.text()).toContain('Static Astro sites never run middleware at request time');
  });

  it('adds to an existing integrations list', () => {
    const p = { ...detect(fixture('astro-ssr')) };
    const fs = { ...nodeFs(p.cwd, () => true), read: (f: string) => (f.startsWith('astro.config') ? "import { defineConfig } from 'astro/config';\nimport mdx from '@astrojs/mdx';\nexport default defineConfig({\n  integrations: [mdx()],\n});\n" : null) };
    const out = plan(p, { url: 'https://t', site: 'shop', token: TOKEN }, fs);
    const cfg = out.changes.find((c) => c.path === 'astro.config.mjs')!;
    expect(cfg.after).toContain('integrations: [trail({ site: "shop" }), mdx()],');
  });

  it('TestInitUnknownExits2', async () => {
    const d = fixture('plain-vite');
    const r = await run(d, ['--yes']);
    expect(r.code).toBe(2);
    expect(r.text()).toContain("trail-analytics/crawl");
    expect(r.text()).toContain('<script defer src="https://trail.example.com/_t/t.js" data-site="shop" data-api="https://trail.example.com/_t/e"></script>');
    expect(r.text()).not.toContain('SITE_ID');
  });

  it('detects Astro hybrid output as server', () => {
    const d = fixture('astro-ssr');
    const cfg = read(d, 'astro.config.mjs');
    writeFileSync(join(d, 'astro.config.mjs'), cfg.replace(/output\s*:\s*['"]server['"]/, "output: 'hybrid'"));
    expect(read(d, 'astro.config.mjs')).toContain('hybrid');
    expect(detect(d).astroOutput).toBe('server');
    const p = plan(detect(d), { url: 'https://t', site: 'shop', token: TOKEN }, nodeFs(d, () => true));
    expect(p.warnings.join('\n')).not.toContain('Static Astro');
  });

  it('TestInitIdempotent', async () => {
    for (const name of ['next16-app', 'next15-app', 'next16-src-js', 'astro-ssr', 'astro-static']) {
      const d = fixture(name);
      expect((await run(d, ['--yes', '--no-install'])).code).toBe(0);
      const p = plan(detect(d), { url: 'https://trail.example.com', site: 'shop', token: TOKEN }, nodeFs(d, () => false));
      expect(p.changes, name).toEqual([]);
      const again = await run(d, ['--yes', '--no-install']);
      expect(again.code).toBe(0);
      expect(again.text()).toContain('Nothing to change');
    }
  });

  it('adds src and api to an existing Analytics without them', () => {
    const d = fixture('next16-app');
    writeFileSync(join(d, 'app/layout.tsx'), read(d, 'app/layout.tsx').replace("import type", "import { Analytics } from 'trail-analytics/next';\nimport type").replace('{children}', '{children}\n        <Analytics site="shop" />'));
    const p = plan(detect(d), { url: 'u', site: 'shop', token: TOKEN }, nodeFs(d, () => true));
    const l = p.changes.find((c) => c.path === 'app/layout.tsx')!;
    expect(l.after).toContain('<Analytics site="shop" src="/t/t.js" api="/t/e" />');
    expect(l.after.match(/trail-analytics\/next/g)).toHaveLength(1);
  });

  it('a commented </body> no longer blocks the edit, two <body> elements do', () => {
    const d = fixture('next16-app');
    writeFileSync(join(d, 'app/layout.tsx'), read(d, 'app/layout.tsx') + '\n// </body>\n');
    const p = plan(detect(d), { url: 'u', site: 'shop', token: TOKEN }, nodeFs(d, () => true));
    expect(p.changes.some((c) => c.path === 'app/layout.tsx')).toBe(true);
    writeFileSync(join(d, 'app/layout.tsx'), read(d, 'app/layout.tsx').replace('</html>', '<body>b</body></html>'));
    const q = plan(detect(d), { url: 'u', site: 'shop', token: TOKEN }, nodeFs(d, () => true));
    expect(q.changes.some((c) => c.path === 'app/layout.tsx')).toBe(false);
    expect(q.manual.join('\n')).toContain('Found 2 <body> elements in app/layout.tsx');
    expect(q.manual.join('\n')).toContain('<Analytics');
  });

  it('TestInitWarnsOnTRoute', () => {
    const d = fixture('next16-app');
    writeFileSync(join(d, 'app/page.tsx'), read(d, 'app/page.tsx'));
    cpSync(join(d, 'app/page.tsx'), join(d, 'app/t/page.tsx'));
    const p = plan(detect(d), { url: 'u', site: 'shop', token: TOKEN }, nodeFs(d, () => true));
    expect(p.warnings.join('\n')).toContain('/t/t.js and /t/e');
  });

  it('TestInitKeepsCRLF', async () => {
    const d = fixture('next16-app');
    writeFileSync(join(d, 'app/layout.tsx'), read(d, 'app/layout.tsx').replace(/\n/g, '\r\n'));
    writeFileSync(join(d, '.env.local'), 'OTHER=1\r\nTRAIL_URL=https://trail.example.com');
    expect((await run(d, ['--yes', '--no-install'])).code).toBe(0);
    const layout = read(d, 'app/layout.tsx');
    expect(layout.replace(/\r\n/g, '')).not.toContain('\n');
    expect(layout).toContain('<Analytics site="shop"');
    expect(read(d, '.env.local')).toBe(`OTHER=1\r\nTRAIL_URL=https://trail.example.com\r\nTRAIL_SITE=shop\r\nTRAIL_CRAWL_TOKEN=${TOKEN}\r\n`);
  });

  it('TestDiffMasksToken', async () => {
    const d = fixture('next16-app');
    const r = await run(d, ['--yes', '--no-install']);
    expect(r.text()).not.toContain(TOKEN);
    expect(r.text()).toContain('TRAIL_CRAWL_TOKEN=••••WXYZ');
    expect(renderDiff([{ path: 'a', before: null, after: `x ${TOKEN} y\n` }], [TOKEN])).toContain('+x ••••WXYZ y');
  });

  it('TestInitNonTTYNeedsYes', async () => {
    const d = fixture('next16-app');
    const r = await run(d, ['--no-install']);
    expect(r.code).toBe(1);
    expect(r.text()).toContain('--yes');
    expect(existsSync(join(d, 'proxy.ts'))).toBe(false);
  });

  it('asks on a TTY and writes nothing on no', async () => {
    const d = fixture('next16-app');
    const ask = vi.fn(async () => false);
    const r = await run(d, ['--no-install'], io({ isTTY: true, ask }));
    expect(ask).toHaveBeenCalledWith('Apply these changes? [y/N] ');
    expect(r.code).toBe(1);
    expect(existsSync(join(d, 'proxy.ts'))).toBe(false);
    const yes = await run(d, ['--no-install'], io({ isTTY: true, ask: async () => true }));
    expect(yes.code).toBe(0);
    expect(existsSync(join(d, 'proxy.ts'))).toBe(true);
  });

  it('TestInitInstallUsesLockfilePM', async () => {
    const d = fixture('next16-app');
    writeFileSync(join(d, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    const r = await run(d, ['--yes']);
    expect(r.code).toBe(0);
    expect(r.spawn).toHaveBeenCalledWith('pnpm', ['install'], { cwd: d, shell: process.platform === 'win32' });
    expect(JSON.parse(read(d, 'package.json')).dependencies['trail-analytics']).toBe('^0.3.0');
  });

  it('TestInitDryRunWritesNothing', async () => {
    const d = fixture('astro-ssr');
    const before = read(d, 'astro.config.mjs');
    const r = await run(d, ['--dry-run']);
    expect(r.code).toBe(0);
    expect(read(d, 'astro.config.mjs')).toBe(before);
    expect(existsSync(join(d, '.env'))).toBe(false);
    expect(r.spawn).not.toHaveBeenCalled();
    expect(r.text()).toContain('+import trail from');
  });

  it('adds .env to .gitignore when it is not ignored, once', async () => {
    const d = fixture('astro-ssr');
    await run(d, ['--yes', '--no-install']);
    expect(read(d, '.gitignore')).toContain('\n.env\n');
    const p = plan(detect(d), { url: 'https://trail.example.com', site: 'shop', token: TOKEN }, nodeFs(d, () => false));
    expect(p.changes).toEqual([]);
  });

  it('rejects missing flags and prints help', async () => {
    const o = io();
    expect(await main(['init', '--url', 'https://x'], o.io)).toBe(1);
    expect(o.text()).toContain('--token');
    const h = io();
    expect(await main(['init', '--help'], h.io)).toBe(0);
    for (const f of ['--url', '--site', '--token', '--yes', '--dry-run', '--cwd', '--no-install']) expect(h.text()).toContain(f);
  });

  it('detect reads the Next major from node_modules first', () => {
    const d = fixture('next16-app');
    cpSync(join(d, 'package.json'), join(d, 'node_modules/next/package.json'));
    writeFileSync(join(d, 'node_modules/next/package.json'), '{"version":"15.5.4"}');
    expect(detect(d)).toMatchObject({ framework: 'next', nextMajor: 15, router: 'app', srcDir: false, ext: 'ts', pm: 'npm' });
  });

  describe('token, url and env file safety', () => {
    it('reads the token from TRAIL_CRAWL_TOKEN', async () => {
      const d = fixture('next16-app');
      const r = await runNoToken(d, ['--yes', '--no-install'], io({ env: { TRAIL_CRAWL_TOKEN: TOKEN } }));
      expect(r.code).toBe(0);
      expect(read(d, '.env.local')).toContain(`TRAIL_CRAWL_TOKEN=${TOKEN}`);
      expect(r.text()).not.toContain(TOKEN);
      expect(r.text()).not.toContain('shell history');
    });

    it('reads the token from stdin with --token -', async () => {
      const d = fixture('next16-app');
      const r = await runNoToken(d, ['--yes', '--no-install', '--token', '-'], io({ readStdin: async () => `${TOKEN}\n` }));
      expect(r.code).toBe(0);
      expect(read(d, '.env.local')).toContain(`TRAIL_CRAWL_TOKEN=${TOKEN}\n`);
      expect(r.text()).not.toContain('shell history');
    });

    it('tells the user a literal --token is in shell history', async () => {
      const d = fixture('next16-app');
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.text()).toContain('shell history');
      expect(r.text()).toContain('--token -');
    });

    it('asks for the token on a TTY when nothing else gives one', async () => {
      const d = fixture('next16-app');
      const askSecret = vi.fn(async () => TOKEN);
      const r = await runNoToken(d, ['--yes', '--no-install'], io({ isTTY: true, askSecret }));
      expect(askSecret).toHaveBeenCalled();
      expect(r.code).toBe(0);
      expect(read(d, '.env.local')).toContain(`TRAIL_CRAWL_TOKEN=${TOKEN}`);
    });

    it('exits 1 with a clear message when no token is available', async () => {
      const d = fixture('next16-app');
      const r = await runNoToken(d, ['--yes', '--no-install']);
      expect(r.code).toBe(1);
      expect(r.text()).toContain('missing --token (or set TRAIL_CRAWL_TOKEN)');
    });

    it('keeps the token on rerun from .env.local without --token', async () => {
      const d = fixture('next16-app');
      expect((await run(d, ['--yes', '--no-install'])).code).toBe(0);
      const before = read(d, '.env.local');
      const again = await runNoToken(d, ['--yes', '--no-install']);
      expect(again.code).toBe(0);
      expect(read(d, '.env.local')).toBe(before);
      expect(again.text()).toContain('Nothing to change');
    });

    it('rejects http for a public host, allows http://localhost:8080', async () => {
      const d = fixture('next16-app');
      const bad = io();
      const r = await main(['init', '--url', 'http://trail.example.com', '--site', 'shop', '--token', TOKEN, '--cwd', d, '--yes', '--no-install'], bad.io);
      expect(r).toBe(1);
      expect(bad.text()).toContain('--url must be https (the crawl token would travel in clear text)');
      expect(existsSync(join(d, '.env.local'))).toBe(false);
      for (const ok of ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://[::1]:8080', 'http://10.1.2.3', 'http://192.168.0.5', 'http://172.20.0.1']) {
        const g = io();
        expect(await main(['init', '--url', ok, '--site', 'shop', '--token', TOKEN, '--cwd', d, '--dry-run'], g.io), ok).toBe(0);
      }
      for (const no of ['http://172.32.0.1', 'http://11.0.0.1', 'http://localhost.evil.com']) {
        const g = io();
        expect(await main(['init', '--url', no, '--site', 'shop', '--token', TOKEN, '--cwd', d, '--dry-run'], g.io), no).toBe(1);
      }
    });

    it('refuses to write a git-tracked .env.local', async () => {
      const d = fixture('next16-app');
      writeFileSync(join(d, '.env.local'), 'OTHER=1\n');
      const r = await run(d, ['--yes', '--no-install'], io({ gitTracked: (f) => f === '.env.local' }));
      expect(r.code).toBe(2);
      expect(read(d, '.env.local')).toBe('OTHER=1\n');
      expect(r.text()).toContain('tracked by git');
      expect(r.text()).toContain('git rm --cached .env.local');
    });

    it('updates a changed TRAIL_URL and token on rerun', async () => {
      const d = fixture('next16-app');
      writeFileSync(join(d, '.env.local'), 'A=1\nTRAIL_URL=https://old.example.com\nTRAIL_SITE=shop\nTRAIL_CRAWL_TOKEN=tk_old_000000000000AAAA\nB=2\n');
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.code).toBe(0);
      expect(read(d, '.env.local')).toBe(`A=1\nTRAIL_URL=https://trail.example.com\nTRAIL_SITE=shop\nTRAIL_CRAWL_TOKEN=${TOKEN}\nB=2\n`);
      expect(r.text()).toContain('••••WXYZ');
      expect(r.text()).toContain('••••AAAA');
      expect(r.text()).not.toContain(TOKEN);
      expect(r.text()).not.toContain('tk_old_000000000000AAAA');
    });

    it('gitignores .dev.vars when wrangler config exists', async () => {
      const d = fixture('next16-app');
      writeFileSync(join(d, 'wrangler.jsonc'), '{}');
      expect((await run(d, ['--yes', '--no-install'])).code).toBe(0);
      const gi = read(d, '.gitignore');
      expect(gi).toContain('.dev.vars');
      const plain = fixture('next16-app');
      await run(plain, ['--yes', '--no-install']);
      expect(read(plain, '.gitignore')).not.toContain('.dev.vars');
    });
  });

  describe('install report shapes', () => {
    it('TestInitReportAgentSkills wraps the next-intl middleware and widens its matcher', async () => {
      const d = fixture('report-agent-skills');
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.code).toBe(0);
      const mw = read(d, 'src/middleware.ts');
      expect(mw).toContain('export default withTrail(middleware);');
      expect(mw).toContain("'/t/t.js', '/t/t.x.js', '/t/t.p.js', '/t/e']");
      expect(existsSync(join(d, 'src/proxy.ts'))).toBe(false);
    });

    it('TestInitReportGenzcareer wraps the async named proxy', async () => {
      const d = fixture('report-genzcareer');
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.code).toBe(0);
      const px = read(d, 'proxy.ts');
      expect(px).toContain('async function proxyHandler(');
      expect(px).toContain('export const proxy = withTrail(proxyHandler);');
      expect(read(d, '__tests__/proxy.test.ts')).toContain('await proxy(new NextRequest');
    });

    it('TestInitReportReelcn wraps the proxy, then says the matcher is narrow', async () => {
      const d = fixture('report-reelcn');
      const app = join(d, 'apps/www');
      const r = await run(app, ['--yes', '--no-install']);
      expect(r.code).toBe(2);
      expect(read(app, 'proxy.ts')).toContain('export const proxy = withTrail(proxyHandler);');
      expect(read(app, 'proxy.ts')).toContain("matcher: ['/docs/:path*', '/t/t.js'");
      expect(r.text()).toContain('matcher only runs on /docs/:path*');
      expect(r.text()).toContain("startsWith('/docs')");
    });

    it('writes middleware.ts when the Next version is unknown', async () => {
      const d = fixture('next16-app');
      writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'x', dependencies: { next: 'latest', react: '*' } }));
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.code).toBe(0);
      expect(existsSync(join(d, 'middleware.ts'))).toBe(true);
      expect(existsSync(join(d, 'proxy.ts'))).toBe(false);
      expect(r.text()).toContain('Could not tell the Next.js version; wrote middleware.ts (works on 15 and 16)');
    });

    it('reads the Next version from pnpm-lock.yaml', async () => {
      const d = fixture('next16-app');
      writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'x', dependencies: { next: 'latest', react: '*' } }));
      writeFileSync(join(d, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\npackages:\n  next@16.2.6:\n    resolution: {}\n");
      expect(detect(d).nextMajor).toBe(16);
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.code).toBe(0);
      expect(existsSync(join(d, 'proxy.ts'))).toBe(true);
      expect(r.text()).not.toContain('Could not tell');
    });

    it('reads the Next version from package-lock.json and yarn.lock', () => {
      const d = fixture('next16-app');
      writeFileSync(join(d, 'package.json'), JSON.stringify({ name: 'x', dependencies: { next: 'latest' } }));
      writeFileSync(join(d, 'package-lock.json'), JSON.stringify({ packages: { 'node_modules/next': { version: '15.5.4' } } }));
      expect(detect(d).nextMajor).toBe(15);
      rmSync(join(d, 'package-lock.json'));
      writeFileSync(join(d, 'yarn.lock'), '"next@^14.0.0":\n  version "14.2.3"\n');
      expect(detect(d).nextMajor).toBe(14);
    });

    it('output export uses the direct Trail URL and no proxy', async () => {
      const d = fixture('next16-app');
      writeFileSync(join(d, 'next.config.mjs'), "export default { output: 'export' };\n");
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.code).toBe(0);
      expect(existsSync(join(d, 'proxy.ts'))).toBe(false);
      expect(read(d, 'app/layout.tsx')).toContain('<Analytics site="shop" src="https://trail.example.com/_t/t.js" api="https://trail.example.com/_t/e" />');
      expect(r.text()).toContain('Static export: no proxy runs');
    });

    it('basePath prefixes the tag paths', async () => {
      const d = fixture('next16-app');
      writeFileSync(join(d, 'next.config.ts'), "import type { NextConfig } from 'next';\nconst nextConfig: NextConfig = { basePath: '/docs' };\nexport default nextConfig;\n");
      expect((await run(d, ['--yes', '--no-install'])).code).toBe(0);
      expect(read(d, 'app/layout.tsx')).toContain('<Analytics site="shop" src="/docs/t/t.js" api="/docs/t/e" />');
      expect(existsSync(join(d, 'proxy.ts'))).toBe(true);
    });

    it('trailingSlash uses /t/e/', async () => {
      const d = fixture('next16-app');
      writeFileSync(join(d, 'next.config.js'), "const withX = (c) => c;\nmodule.exports = withX({ trailingSlash: true });\n");
      expect((await run(d, ['--yes', '--no-install'])).code).toBe(0);
      expect(read(d, 'app/layout.tsx')).toContain('src="/t/t.js" api="/t/e/"');
    });

    it('i18n (Pages Router) keeps the tag at /t/e', async () => {
      const d = fixture('next15-pages');
      writeFileSync(join(d, 'next.config.js'), "module.exports = { i18n: { locales: ['en', 'de'], defaultLocale: 'en' } };\n");
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.text()).toContain('api="/t/e"');
      expect(r.text()).not.toContain('/de/t/e');
    });
  });

  describe('root layouts', () => {
    it('TestInitReportAgentSkillsLayout edits src/app/[locale]/layout.tsx', async () => {
      const d = fixture('report-agent-skills');
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.code).toBe(0);
      expect(read(d, 'src/app/[locale]/layout.tsx')).toContain('<Analytics site="shop" src="/t/t.js" api="/t/e" />');
      expect(existsSync(join(d, 'src/app/layout.tsx'))).toBe(false);
    });

    it('TestInitReportPlumb aliases next to the Vercel tag in a .jsx layout', async () => {
      const d = fixture('report-plumb');
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.code).toBe(0);
      const l = read(d, 'app/layout.jsx');
      expect(l).toContain('import { Analytics } from "@vercel/analytics/next";');
      expect(l).toContain("import { Analytics as TrailAnalytics } from 'trail-analytics/next';");
      expect(l).toContain('        <Analytics />\n        <TrailAnalytics site="shop" src="/t/t.js" api="/t/e" />\n      </body>');
    });

    it('TestInitReportTermui keeps the body attributes and aliases', async () => {
      const d = fixture('report-termui');
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.code).toBe(0);
      const l = read(d, 'src/app/layout.tsx');
      expect(l).toContain('<body className="dark">');
      expect(l).toContain('<TrailAnalytics site="shop"');
      expect(read(d, 'src/proxy.ts')).toContain('export default function proxy');
    });

    it('TestInitReportGenzcareer aliases next to the local Analytics component', async () => {
      const d = fixture('report-genzcareer');
      await run(d, ['--yes', '--no-install']);
      const l = read(d, 'app/layout.tsx');
      expect(l).toContain('import { Analytics } from "@/components/analytics";');
      expect(l).toContain("import { Analytics as TrailAnalytics } from 'trail-analytics/next';");
    });

    it('warns about a hand-added Trail script', async () => {
      const d = fixture('next16-app');
      writeFileSync(join(d, 'app/layout.tsx'), read(d, 'app/layout.tsx').replace('{children}', '{children}\n<script defer src="https://t.example.com/_t/t.js" data-site="shop" />'));
      const r = await run(d, ['--dry-run']);
      expect(r.text()).toContain('also loads the Trail script by hand (line 10); remove it, the component replaces it.');
    });

    it('TestInitIdempotent on every report fixture: a second plan has no changes', async () => {
      for (const name of ['report-agent-skills', 'report-genzcareer', 'report-reelcn', 'report-plumb', 'report-termui']) {
        const d = fixture(name);
        const cwd = name === 'report-reelcn' ? join(d, 'apps/www') : d;
        await run(cwd, ['--yes', '--no-install']);
        const p = plan(detect(cwd), { url: 'https://trail.example.com', site: 'shop', token: TOKEN }, nodeFs(cwd, () => false));
        expect(p.changes, name).toEqual([]);
      }
    });
  });

  describe('package manager, workspaces and lockfiles', () => {
    it('TestInitReportCrivello writes the dependency and installs at the workspace root', async () => {
      const d = fixture('report-crivello');
      const app = join(d, 'apps/web');
      const r = await run(app, ['--yes']);
      expect(r.code).toBe(0);
      const pkg = JSON.parse(read(app, 'package.json'));
      expect(pkg.dependencies['trail-analytics']).toBe('^0.3.0');
      expect(Object.keys(pkg.dependencies)).toEqual(['@vercel/analytics', 'next', 'react', 'react-dom', 'trail-analytics']);
      expect(r.spawn).toHaveBeenCalledWith('pnpm', ['install'], { cwd: d, shell: false });
      expect(existsSync(join(app, 'pnpm-lock.yaml'))).toBe(false);
      expect(read(app, 'src/app/layout.tsx')).toContain('<TrailAnalytics site="shop"');
      expect(r.text()).toContain('+    "trail-analytics": "^0.3.0"');
    });

    it('TestInitReportTermuiNoLockfile updates package.json and does not install', async () => {
      const d = fixture('report-termui');
      const r = await run(d, ['--yes']);
      expect(r.code).toBe(0);
      expect(r.spawn).not.toHaveBeenCalled();
      expect(JSON.parse(read(d, 'package.json')).dependencies['trail-analytics']).toBe('^0.3.0');
      expect(r.text()).toContain('No lockfile found, so init did not install (that would create one). Run your usual install.');
      expect(existsSync(join(d, 'package-lock.json'))).toBe(false);
    });

    it('--no-install still writes the dependency and says what to run', async () => {
      const d = fixture('next16-app');
      writeFileSync(join(d, 'package-lock.json'), '{}');
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.spawn).not.toHaveBeenCalled();
      expect(JSON.parse(read(d, 'package.json')).dependencies['trail-analytics']).toBe('^0.3.0');
      expect(r.text()).toContain('Not installing (--no-install). Run: npm install');
    });

    it('keeps tab indentation and the trailing newline, and edits devDependencies in place', async () => {
      const d = fixture('next16-app');
      writeFileSync(join(d, 'package.json'), '{\n\t"dependencies": {\n\t\t"next": "^16.0.0"\n\t},\n\t"devDependencies": {\n\t\t"trail-analytics": "^0.2.0"\n\t}\n}\n');
      await run(d, ['--yes', '--no-install']);
      const txt = read(d, 'package.json');
      expect(txt).toBe('{\n\t"dependencies": {\n\t\t"next": "^16.0.0"\n\t},\n\t"devDependencies": {\n\t\t"trail-analytics": "^0.3.0"\n\t}\n}\n');
    });

    it('leaves workspace: and current ranges alone', async () => {
      for (const range of ['workspace:*', '^0.3.1']) {
        const d = fixture('next16-app');
        writeFileSync(join(d, 'package.json'), JSON.stringify({ dependencies: { next: '^16.0.0', 'trail-analytics': range } }));
        const before = read(d, 'package.json');
        const r = await run(d, ['--yes']);
        expect(read(d, 'package.json'), range).toBe(before);
        expect(r.spawn).not.toHaveBeenCalled();
      }
    });

    it('warns when the repo pins a different package manager version', async () => {
      const d = fixture('report-crivello');
      const r = await run(join(d, 'apps/web'), ['--yes'], io({ pmVersion: () => '8.0.0' }));
      expect(r.text()).toContain('Your repo pins pnpm@9.15.9; you have 8.0.0. Init ran pnpm install anyway; if the lockfile changes more than the trail-analytics lines, run it with npx pnpm@9.15.9 install.');
    });

    it('a failed install exits 1 with the exact command and says the rest was written', async () => {
      const d = fixture('next16-app');
      writeFileSync(join(d, 'package-lock.json'), '{}');
      const r = await run(d, ['--yes'], io({ spawn: vi.fn(async () => 1) }));
      expect(r.code).toBe(1);
      expect(r.text()).toContain('npm install');
      expect(r.text()).toContain('All other changes were written.');
      expect(existsSync(join(d, 'proxy.ts'))).toBe(true);
      expect(JSON.parse(read(d, 'package.json')).dependencies['trail-analytics']).toBe('^0.3.0');
    });

    it('uses shell on win32', () => {
      expect(spawnOptions('win32')).toEqual({ shell: true });
      expect(spawnOptions('darwin')).toEqual({ shell: false });
      expect(spawnOptions('linux')).toEqual({ shell: false });
    });

    it('reads the Next version from the lockfile at the workspace root', () => {
      const d = fixture('report-crivello');
      writeFileSync(join(d, 'apps/web/package.json'), JSON.stringify({ name: 'w', dependencies: { next: 'latest' } }));
      expect(detect(join(d, 'apps/web')).nextMajor).toBe(16);
    });
  });

  describe('output (task 10)', () => {
    it('non-TTY prints DRY RUN first and last', async () => {
      const d = fixture('next16-app');
      const r = await run(d, ['--no-install']);
      expect(r.code).toBe(1);
      const banner = 'DRY RUN: nothing will be written. Add --yes to apply.';
      expect(r.out[0]).toContain(banner);
      expect(r.out[r.out.length - 1]).toContain(banner);
      expect(existsSync(join(d, 'proxy.ts'))).toBe(false);
    });

    it('--dry-run also gets the banner and writes nothing', async () => {
      const d = fixture('next16-app');
      const r = await run(d, ['--dry-run', '--no-install'], io({ isTTY: true }));
      expect(r.out[0]).toContain('DRY RUN');
      expect(existsSync(join(d, 'proxy.ts'))).toBe(false);
    });

    it('applying prints the plain banner first', async () => {
      const d = fixture('next16-app');
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.out[0]).toContain('trail-analytics init');
      expect(r.text()).not.toContain('DRY RUN');
    });

    it('prints sections in order', async () => {
      const d = fixture('report-agent-skills');
      const r = await run(d, ['--no-install', '--dry-run']);
      const t = r.text();
      const at = (s: string) => {
        const i = t.indexOf(s);
        expect(i, s).toBeGreaterThan(-1);
        return i;
      };
      const order = [at('DRY RUN'), at('Next.js'), at('accepts the crawl token'), at('+++ b/'), at('Environment (set before you deploy):'), at('Testing: Trail ignores localhost'), at('If Cloudflare sits in front')];
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it('stops before writing when the token is rejected (401)', async () => {
      const d = fixture('next16-app');
      const fetch = (async (u: any) => new Response('', { status: String(u).includes('/_t/t.js') ? 200 : 401 })) as unknown as typeof globalThis.fetch;
      const r = await run(d, ['--yes', '--no-install'], io({ fetch }));
      expect(r.code).toBe(1);
      expect(r.text()).toContain('Error:');
      expect(r.text()).toContain('token rejected');
      expect(existsSync(join(d, 'proxy.ts'))).toBe(false);
      expect(existsSync(join(d, '.env.local'))).toBe(false);
    });

    it('--offline skips the check', async () => {
      const d = fixture('next16-app');
      const fetch = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof globalThis.fetch;
      const r = await run(d, ['--yes', '--no-install', '--offline'], io({ fetch }));
      expect(r.code).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('prints wrangler commands for the agent-skills fixture', async () => {
      const d = fixture('report-agent-skills');
      const r = await run(d, ['--no-install', '--dry-run']);
      expect(r.text()).toContain('npx wrangler secret put TRAIL_CRAWL_TOKEN');
      expect(r.text()).toContain('.dev.vars');
    });

    it('prints the localhost note', async () => {
      const d = fixture('next16-app');
      const r = await run(d, ['--yes', '--no-install']);
      expect(r.text()).toContain('Trail ignores localhost and automated browsers. To see events locally add dev to the tag (<Analytics … dev />)');
      expect(r.text()).toContain('npx trail-analytics verify --url https://<your-site>');
    });

    it('never prints the token in envSteps', async () => {
      const d = fixture('report-agent-skills');
      const r = await run(d, ['--no-install', '--dry-run']);
      expect(r.text()).not.toContain(TOKEN);
      expect(r.text()).toContain("grep '^TRAIL_CRAWL_TOKEN=' .env.local");
    });
  });
});
