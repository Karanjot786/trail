// Every export subpath in package.json resolves after `npm run build` (AI agents plan Task P0-4).
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const require = createRequire(import.meta.url);

type Cond = { types: string; default: string };
type Entry = { import: Cond; require?: Cond };
const entries = Object.entries(pkg.exports as Record<string, string | Entry>).filter(
  ([k, v]) => k !== './package.json' && typeof v !== 'string',
) as [string, Entry][];

const load = (path: string) => import(pathToFileURL(resolve(root, path)).href);

describe('package exports', () => {
  beforeAll(() => {
    if (!existsSync(resolve(root, 'dist/index.js'))) {
      throw new Error('dist/ is missing: this suite checks the built package, so run `npm run build` before `npm test`.');
    }
  });

  it('lists the 0.2.0 entry points and the CLI bin', () => {
    expect(pkg.version).toBe('0.3.0');
    expect(entries.map(([k]) => k)).toEqual(['.', './react', './next', './next/proxy', './astro', './astro/middleware', './crawl']);
    expect(pkg.bin).toEqual({ 'trail-analytics': 'dist/cli.js' });
    expect(entries.find(([k]) => k === './astro/middleware')?.[1].require).toBeUndefined();
  });

  for (const [sub, v] of entries) {
    it(`${sub} resolves`, async () => {
      for (const c of [v.import, v.require]) {
        if (!c) continue;
        expect(existsSync(resolve(root, c.types)), c.types).toBe(true);
        expect(existsSync(resolve(root, c.default)), c.default).toBe(true);
      }
      // The React and Next component entries need react/next at import time; the new entries need nothing.
      if (sub === './react' || sub === './next') return;
      expect(Object.keys(await load(v.import.default)).length).toBeGreaterThan(0);
      if (v.require) expect(Object.keys(require(resolve(root, v.require.default))).length).toBeGreaterThan(0);
    });
  }

  it('ships the CLI with a node shebang', () => {
    expect(readFileSync(resolve(root, 'dist/cli.js'), 'utf8').startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('exports the frozen API names', async () => {
    const crawl = await load('dist/crawl/index.js');
    for (const name of ['shouldReport', 'toLine', 'report', 'hono', 'express', 'withTrail', 'forward', 'edgeGeo']) {
      expect(typeof crawl[name], name).toBe('function');
    }
    expect(crawl.CRAWLER_TOKENS).toContain('GPTBot');
    expect(crawl.AGENT_TOKENS).toEqual(['Claude-Agent', 'Google-Agent', 'GoogleAgent-Mariner']);
    const proxy = await load('dist/next/proxy/index.js');
    expect(typeof proxy.default).toBe('function');
    expect(typeof proxy.withTrail).toBe('function');
    expect(typeof (await load('dist/astro/index.js')).default).toBe('function');
    expect(typeof (await load('dist/astro/middleware.js')).onRequest).toBe('function');
  });
});
