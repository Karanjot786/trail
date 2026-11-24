// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import proxy, { withTrail } from './proxy';

const GPT = 'Mozilla/5.0; compatible; GPTBot/1.2';
const CHROME = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
const rq = (path: string, ua: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request('https://shop.example' + path, { ...init, headers: { 'user-agent': ua, host: 'shop.example', ...init.headers } });

describe('next/proxy', () => {
  const fetchMock = vi.fn();
  const event = { waitUntil: vi.fn() };
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    event.waitUntil.mockReset();
    vi.stubEnv('TRAIL_URL', 'https://trail.example');
    vi.stubEnv('TRAIL_SITE', 'demo');
    vi.stubEnv('TRAIL_CRAWL_TOKEN', 'tk_abcdefghijklmnop');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('reports a GPTBot request with status 0 through waitUntil and continues', async () => {
    const res = await proxy(rq('/pricing', GPT) as any, event as any);
    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(event.waitUntil).toHaveBeenCalledTimes(1);
    await event.waitUntil.mock.calls[0][0];
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://trail.example/api/v1/crawls?site=demo');
    expect(JSON.parse(init.body)).toMatchObject({ path: '/pricing', status: 0 });
  });

  it('does not report Chrome', async () => {
    const res = await proxy(rq('/', CHROME) as any, event as any);
    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(event.waitUntil).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves /t/t.js from Trail', async () => {
    fetchMock.mockResolvedValue(new Response('/*t*/', { headers: { 'content-type': 'text/javascript' } }));
    const res = await proxy(rq('/t/t.js', CHROME) as any, event as any);
    expect(fetchMock.mock.calls[0][0]).toBe('https://trail.example/_t/t.js');
    expect(await res.text()).toBe('/*t*/');
  });

  it('forwards POST /t/e signed with Vercel geo', async () => {
    const res = await proxy(rq('/t/e', CHROME, { method: 'POST', body: '[]', headers: { 'x-vercel-ip-country': 'IN', 'x-real-ip': '1.2.3.4' } }) as any, event as any);
    expect(res.status).toBe(202);
    const h = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(fetchMock.mock.calls[0][0]).toBe('https://trail.example/_t/e');
    expect(h.get('x-trail-geo')).toBe('IN||');
    expect(h.get('x-trail-proxy')).toMatch(/^v1;k=tk_abcdefghi;t=\d+;s=[0-9a-f]{64}$/);
  });

  it('passes other /t paths through to the site', async () => {
    const res = await proxy(rq('/t/other', CHROME) as any, event as any);
    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves the stub when TRAIL_URL is not set', async () => {
    vi.stubEnv('TRAIL_URL', '');
    const res = await proxy(rq('/t/t.js', CHROME) as any, event as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-trail-error')).toBe('no-url');
    expect(res.headers.get('x-middleware-next')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses nextUrl.pathname so basePath works', async () => {
    const req = Object.assign(new Request('https://shop.example/docs/t/t.js', { headers: { 'user-agent': CHROME } }), { nextUrl: { pathname: '/t/t.js' } });
    await proxy(req as any, event as any);
    expect(fetchMock.mock.calls[0][0]).toBe('https://trail.example/_t/t.js');
  });

  it('withTrail keeps the user handler response and still reports', async () => {
    const mine = new Response('mine', { status: 307, headers: { location: '/x' } });
    const h = withTrail(async () => mine);
    const res = await h(rq('/', GPT) as any, event as any);
    expect(res).toBe(mine);
    expect(event.waitUntil).toHaveBeenCalledTimes(1);
  });

  it('withTrail forwards /t/e when the user handler continues', async () => {
    const h = withTrail(() => undefined);
    const res = await h(rq('/t/e', CHROME, { method: 'POST', body: '[]' }) as any, event as any);
    expect(res?.status).toBe(202);
  });

  it('imports no node: modules (runs on Edge and Node)', () => {
    const src = readFileSync(resolve(__dirname, 'proxy.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"]node:/);
    for (const f of ['filter', 'forward', 'send', 'env', 'ip', 'cloudflare.gen']) expect(readFileSync(resolve(__dirname, `../crawl/${f}.ts`), 'utf8')).not.toMatch(/from ['"]node:/);
  });
});
