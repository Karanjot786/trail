// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import trail from './index';
import { onRequest } from './middleware';

function setup(output: 'static' | 'server', opts?: Parameters<typeof trail>[0], extra: Record<string, unknown> = {}) {
  const calls = { mw: [] as any[], scripts: [] as [string, string][], warn: [] as string[], updates: [] as any[] };
  const integ = trail(opts);
  integ.hooks['astro:config:setup']!({
    config: { output, ...extra },
    updateConfig: (c: any) => calls.updates.push(c),
    addMiddleware: (m: any) => calls.mw.push(m),
    injectScript: (stage: string, code: string) => calls.scripts.push([stage, code]),
    logger: { warn: (m: string) => calls.warn.push(m), info: () => {} },
  } as any);
  return calls;
}

describe('astro integration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('server output adds the middleware once, pre, and a first-party loader', () => {
    const c = setup('server', { site: 'demo' });
    expect(integName()).toBe('trail-analytics');
    expect(c.mw).toEqual([{ entrypoint: 'trail-analytics/astro/middleware', order: 'pre' }]);
    expect(c.scripts).toHaveLength(1);
    const [stage, code] = c.scripts[0];
    expect(stage).toBe('head-inline');
    expect(code).toContain('"demo"');
    expect(code).toContain('"/t/t.js"');
    expect(code).toContain('"/t/e"');
    expect(c.warn).toEqual([]);
  });

  it('static output adds no middleware, loads Trail directly and warns', () => {
    const c = setup('static', { site: 'demo', url: 'https://trail.example/' });
    expect(c.mw).toEqual([]);
    const code = c.scripts[0][1];
    expect(code).toContain('"https://trail.example/_t/t.js"');
    expect(code).toContain('"https://trail.example/_t/e"');
    expect(c.warn.some((w) => w.includes('Static Astro sites never run middleware at request time'))).toBe(true);
  });

  it('static output without a url warns about TRAIL_URL too', () => {
    const c = setup('static', { site: 'demo' });
    expect(c.warn).toHaveLength(2);
    expect(c.warn.some((w) => w.includes('TRAIL_URL'))).toBe(true);
  });

  it('trusts the declared site host so same-origin beacons pass the origin check', () => {
    const c = setup('server', { site: 'demo' }, { site: 'https://shop.example:8443/', adapter: { name: '@astrojs/node' } });
    expect(c.updates).toEqual([{ security: { allowedDomains: [{ protocol: 'https', hostname: 'shop.example', port: '8443' }] } }]);
    expect(c.warn).toEqual([]);
  });

  it('leaves configured allowedDomains alone and warns on node without a site', () => {
    expect(setup('server', { site: 'demo' }, { site: 'https://a.example', security: { allowedDomains: [{ hostname: 'b' }] } }).updates).toEqual([]);
    const c = setup('server', { site: 'demo' }, { adapter: { name: '@astrojs/node' } });
    expect(c.updates).toEqual([]);
    expect(c.warn.join()).toContain('allowedDomains');
  });

  it('reads the site from TRAIL_SITE when not given', () => {
    vi.stubEnv('TRAIL_SITE', 'envsite');
    expect(setup('server').scripts[0][1]).toContain('"envsite"');
  });
});

const integName = () => trail().name;

describe('astro middleware', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('TRAIL_URL', 'https://trail.example');
    vi.stubEnv('TRAIL_SITE', 'demo');
    vi.stubEnv('TRAIL_CRAWL_TOKEN', 'tk_abcdefghijklmnop');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const ctx = (path: string, ua: string, init: RequestInit = {}, locals: any = {}) => ({
    request: new Request('https://site.example' + path, { ...init, headers: { 'user-agent': ua, host: 'site.example', ...(init.headers as any) } }),
    locals,
  });

  it('reports GPTBot with the real status from next()', async () => {
    const res = await onRequest(ctx('/gone', 'GPTBot/1.2') as any, async () => new Response('x', { status: 404 }));
    expect(res!.status).toBe(404);
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ path: '/gone', status: 404 });
  });

  it('middleware serves the stub without TRAIL_URL', async () => {
    vi.stubEnv('TRAIL_URL', '');
    const next = vi.fn();
    const res = await onRequest(ctx('/t/t.js', 'Mozilla/5.0 Chrome/131') as any, next);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-trail-error')).toBe('no-url');
    expect(next).not.toHaveBeenCalled();
  });

  it('uses the Cloudflare waitUntil and env when present', async () => {
    const waitUntil = vi.fn();
    vi.stubEnv('TRAIL_URL', '');
    await onRequest(ctx('/', 'GPTBot/1.2', {}, { runtime: { ctx: { waitUntil }, env: { TRAIL_URL: 'https://cf.example', TRAIL_CRAWL_TOKEN: 't', TRAIL_SITE: 's' } } }) as any, async () => new Response('ok'));
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://cf.example/api/v1/crawls?site=s');
  });

  it('forwards POST /t/e signed with the body intact and skips next()', async () => {
    const next = vi.fn();
    const res = await onRequest(ctx('/t/e', 'Chrome', { method: 'POST', body: '[{"s":"demo"}]' }, { runtime: { cf: { country: 'IN', regionCode: 'KA', city: 'Bengaluru' } } }) as any, next);
    expect(next).not.toHaveBeenCalled();
    expect(res!.status).toBe(202);
    const init = fetchMock.mock.calls[0][1];
    expect(new TextDecoder().decode(init.body)).toBe('[{"s":"demo"}]');
    const h = new Headers(init.headers);
    expect(h.get('x-trail-geo')).toBe('IN|KA|Bengaluru');
    expect(h.get('x-trail-geo-src')).toBe('cloudflare');
    expect(h.get('x-trail-proxy')).toMatch(/^v1;k=/);
  });

  it('leaves people alone', async () => {
    await onRequest(ctx('/', 'Mozilla/5.0 Chrome/131') as any, async () => new Response('ok'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('astro dev env', () => {
  it('loads TRAIL_ values from .env without overriding the environment', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    const { loadDevEnv } = await import('./index');
    const d = mkdtempSync(join(tmpdir(), 'astro-env-'));
    writeFileSync(join(d, '.env'), 'OTHER=1\nTRAIL_URL="https://from.file"\r\nTRAIL_SITE=filesite\n');
    vi.stubEnv('TRAIL_SITE', 'shell');
    vi.stubEnv('TRAIL_URL', '');
    loadDevEnv(pathToFileURL(d + '/'));
    expect(process.env.TRAIL_URL).toBe('https://from.file');
    expect(process.env.TRAIL_SITE).toBe('shell');
    expect(process.env.OTHER).toBeUndefined();
    vi.unstubAllEnvs();
    rmSync(d, { recursive: true });
  });
});
