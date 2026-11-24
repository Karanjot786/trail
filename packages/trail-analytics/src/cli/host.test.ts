// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkTrail, detectHost, envSteps } from './host';
import type { Workspace } from './workspace';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (files: Record<string, string> = {}) => {
  const d = mkdtempSync(join(tmpdir(), 'trail-host-'));
  dirs.push(d);
  for (const [f, c] of Object.entries(files)) {
    mkdirSync(join(d, f, '..'), { recursive: true });
    writeFileSync(join(d, f), c);
  }
  return d;
};
const ws = (root: string): Workspace => ({ root, pm: 'npm', isWorkspace: false });
const o = { url: 'https://trail.example.com', site: 'shop', envFile: '.env.local' };
const TOKEN_FROM_FILE = `"$(grep '^TRAIL_CRAWL_TOKEN=' .env.local | cut -d= -f2-)"`;

describe('detectHost', () => {
  it('cloudflare from wrangler config or the opennext dependency', () => {
    const d = tmp({ 'wrangler.jsonc': '{}' });
    expect(detectHost(d, ws(d), {})).toBe('cloudflare');
    const e = tmp();
    expect(detectHost(e, ws(e), { '@opennextjs/cloudflare': '1' })).toBe('cloudflare');
  });
  it('vercel from .vercel/project.json or vercel.json', () => {
    const d = tmp({ '.vercel/project.json': '{}' });
    expect(detectHost(d, ws(d), {})).toBe('vercel');
    const e = tmp({ 'vercel.json': '{}' });
    expect(detectHost(e, ws(e), {})).toBe('vercel');
  });
  it('vercel project in the workspace root', () => {
    const root = tmp({ '.vercel/project.json': '{}' });
    const app = join(root, 'apps/www');
    mkdirSync(app, { recursive: true });
    expect(detectHost(app, ws(root), {})).toBe('vercel');
  });
  it('netlify, aws and unknown', () => {
    const n = tmp({ 'netlify.toml': '' });
    expect(detectHost(n, ws(n), {})).toBe('netlify');
    const a = tmp({ 'sst.config.ts': '' });
    expect(detectHost(a, ws(a), {})).toBe('aws');
    const b = tmp();
    expect(detectHost(b, ws(b), { sst: '3' })).toBe('aws');
    expect(detectHost(b, ws(b), {})).toBe('unknown');
  });
  it('first match wins: cloudflare before vercel', () => {
    const d = tmp({ 'wrangler.toml': '', 'vercel.json': '{}' });
    expect(detectHost(d, ws(d), {})).toBe('cloudflare');
  });
});

describe('envSteps', () => {
  it('vercel', () => {
    expect(envSteps('vercel', o)).toBe(
      [
        "printf %s 'https://trail.example.com' | npx vercel env add TRAIL_URL --environment production,preview --no-sensitive",
        "printf %s 'shop' | npx vercel env add TRAIL_SITE --environment production,preview --no-sensitive",
        `printf %s ${TOKEN_FROM_FILE} | npx vercel env add TRAIL_CRAWL_TOKEN --environment production,preview --sensitive`,
        '(needs Vercel CLI 64.6.0 or later)',
        'Redeploy: env changes apply to new deployments only.',
      ].join('\n'),
    );
  });
  it('cloudflare', () => {
    expect(envSteps('cloudflare', o)).toBe(
      [
        "printf %s 'https://trail.example.com' | npx wrangler secret put TRAIL_URL",
        "printf %s 'shop' | npx wrangler secret put TRAIL_SITE",
        `printf %s ${TOKEN_FROM_FILE} | npx wrangler secret put TRAIL_CRAWL_TOKEN`,
        'For local preview put the same lines in .dev.vars (gitignored).',
      ].join('\n'),
    );
  });
  it('netlify', () => {
    expect(envSteps('netlify', o)).toBe(
      [
        "npx netlify env:set TRAIL_URL 'https://trail.example.com'",
        "npx netlify env:set TRAIL_SITE 'shop'",
        `npx netlify env:set TRAIL_CRAWL_TOKEN ${TOKEN_FROM_FILE}`,
      ].join('\n'),
    );
  });
  it('aws adds the CloudFront note, unknown does not', () => {
    const base =
      'Set these in the runtime environment of the server that runs your proxy (Lambda env, SSM parameters your deploy reads, Docker env), then redeploy: TRAIL_URL=https://trail.example.com TRAIL_SITE=shop TRAIL_CRAWL_TOKEN=<value in .env.local>.';
    expect(envSteps('unknown', o)).toBe(base);
    expect(envSteps('aws', o)).toBe(base + '\nIf verify shows a CloudFront address as your IP, set TRAIL_IP_HEADER=cloudfront-viewer-address and add that header to your CloudFront origin request policy.');
  });
  it('never contains a token value', () => {
    for (const h of ['vercel', 'cloudflare', 'netlify', 'aws', 'unknown'] as const) expect(envSteps(h, o)).not.toMatch(/tk_/);
  });
});

describe('checkTrail', () => {
  const mk = (script: number, crawl: number, body = '') =>
    (async (u: any, init?: any) => {
      const url = String(u);
      if (url.includes('/_t/t.js')) return new Response('js', { status: script });
      expect(init?.method).toBe('POST');
      expect(init?.headers?.authorization).toBe('Bearer tk');
      return new Response(body, { status: crawl });
    }) as unknown as typeof fetch;
  it('ok on 200 and 202', async () => {
    const r = await checkTrail('https://t.x', 'shop', 'tk', mk(200, 202));
    expect(r.ok).toBe(true);
  });
  it('401 is token rejected', async () => {
    const r = await checkTrail('https://t.x', 'shop', 'tk', mk(200, 401));
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toContain('token rejected');
  });
  it('403 shows the body, 400 is unknown site', async () => {
    expect((await checkTrail('https://t.x', 'shop', 'tk', mk(200, 403, 'token is limited to site X'))).lines.join('\n')).toContain('token is limited to site X');
    expect((await checkTrail('https://t.x', 'shop', 'tk', mk(200, 400))).lines.join('\n')).toContain('unknown site');
  });
  it('tracker not 200 and network error', async () => {
    expect((await checkTrail('https://t.x', 'shop', 'tk', mk(404, 202))).ok).toBe(false);
    const boom = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const r = await checkTrail('https://t.x', 'shop', 'tk', boom);
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toContain('cannot reach https://t.x');
  });
});
