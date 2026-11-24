// @vitest-environment node
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detect } from './detect';
import { renderDiff } from './diff';
import { main, type Io } from './index';
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
  };
  return { io: { ...base, ...over }, out, err, spawn, text: () => out.join('') + err.join('') };
}

const read = (d: string, p: string) => readFileSync(join(d, p), 'utf8');
const run = (d: string, extra: string[] = [], o = io()) => main([...ARGS, '--cwd', d, ...extra], o.io).then((code) => ({ code, ...o }));

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

  it('TestInitExistingProxyIsManual', async () => {
    const d = fixture('next16-existing-proxy');
    const before = read(d, 'proxy.ts');
    const r = await run(d, ['--yes', '--no-install']);
    expect(r.code).toBe(2);
    expect(read(d, 'proxy.ts')).toBe(before);
    expect(r.text()).toContain('withTrail');
    expect(r.text()).toContain("import { withTrail } from 'trail-analytics/next/proxy'");
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

  it('two </body> is manual', () => {
    const d = fixture('next16-app');
    writeFileSync(join(d, 'app/layout.tsx'), read(d, 'app/layout.tsx') + '\n// </body>\n');
    const p = plan(detect(d), { url: 'u', site: 'shop', token: TOKEN }, nodeFs(d, () => true));
    expect(p.changes.some((c) => c.path === 'app/layout.tsx')).toBe(false);
    expect(p.manual.join('\n')).toContain('<Analytics');
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
    expect(r.spawn).toHaveBeenCalledWith('pnpm', ['add', 'trail-analytics@^0.3.0'], { cwd: d, shell: false });
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
});
