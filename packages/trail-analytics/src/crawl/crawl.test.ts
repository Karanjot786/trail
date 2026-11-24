// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { express, hono, report, shouldReport, toLine, withTrail } from './index';

const GPT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot';
const CLAUDE_AGENT = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Claude-Agent/1.0';
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const rq = (path: string, ua: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request('https://example.com' + path, { ...init, headers: { 'user-agent': ua, host: 'example.com', ...init.headers } });

describe('shouldReport', () => {
  it.each([
    ['/', GPT, true],
    ['/', CLAUDE_AGENT, true],
    ['/', CHROME, false],
    ['/', '', false],
    ['/', 'mozilla gptbot lowercase', true],
    ['/robots.txt', CHROME, false],
    ['/robots.txt', GPT, true],
    ['/llms.txt', GPT, true],
    ['/llms-full.txt', GPT, true],
    ['/sitemap-0.xml', GPT, true],
    ['/_next/static/x.js', GPT, false],
    ['/_next/image?url=x', GPT, false],
    ['/_astro/a.css', GPT, false],
    ['/_t/t.js', GPT, false],
    ['/logo.PNG', GPT, false],
    ['/font.woff2', GPT, false],
    ['/doc.pdf', GPT, false],
    ['/blog/post', GPT, true],
  ])('%s with %s → %s', (path, ua, want) => {
    expect(shouldReport(rq(path, ua))).toBe(want);
  });

  it('keeps a request with a signature-agent header even with a browser UA', () => {
    expect(shouldReport(rq('/', CHROME, { headers: { 'signature-agent': '"https://chatgpt.com"' } }))).toBe(true);
  });
});

describe('toLine', () => {
  it('takes cf-connecting-ip first, then x-real-ip, then the first x-forwarded-for', () => {
    const all = { 'cf-connecting-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '3.3.3.3, 4.4.4.4' };
    expect(toLine(rq('/', GPT, { headers: all })).ip).toBe('1.1.1.1');
    expect(toLine(rq('/', GPT, { headers: { 'x-real-ip': '2.2.2.2', 'x-forwarded-for': '3.3.3.3' } })).ip).toBe('2.2.2.2');
    expect(toLine(rq('/', GPT, { headers: { 'x-forwarded-for': ' 3.3.3.3 , 4.4.4.4' } })).ip).toBe('3.3.3.3');
    expect(toLine(rq('/', GPT)).ip).toBeUndefined();
  });

  it('builds a line with path only (no query), status default 0, host and signature headers', () => {
    const before = Date.now();
    const l = toLine(
      rq('/a/b?q=secret', GPT, { headers: { 'signature-agent': '"https://chatgpt.com"', 'signature-input': 'sig1=("@authority")', signature: 'sig1=:AAA=:' } }),
    );
    expect(l.path).toBe('/a/b');
    expect(l.status).toBe(0);
    expect(l.ua).toBe(GPT);
    expect(l.host).toBe('example.com');
    expect(l.sa).toBe('"https://chatgpt.com"');
    expect(l.si).toBe('sig1=("@authority")');
    expect(l.sig).toBe('sig1=:AAA=:');
    expect(l.ts).toBeGreaterThanOrEqual(before);
    expect(toLine(rq('/', GPT), 404).status).toBe(404);
  });

  it('caps signature headers at 4 KB and omits absent ones', () => {
    const l = toLine(rq('/', GPT, { headers: { signature: 'x'.repeat(10000) } }));
    expect(l.sig).toHaveLength(4096);
    expect('sa' in l).toBe(false);
    expect('si' in l).toBe(false);
  });
});

describe('report', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs one NDJSON line with the bearer token', async () => {
    const waits: Promise<unknown>[] = [];
    report(rq('/x', GPT), { url: 'https://trail.example/', site: 'demo', token: 'tk_secret', status: 200, waitUntil: (p) => waits.push(p) });
    expect(waits).toHaveLength(1);
    await waits[0];
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://trail.example/api/v1/crawls?site=demo');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ authorization: 'Bearer tk_secret', 'content-type': 'application/x-ndjson' });
    expect(init.signal).toBeDefined();
    expect(init.body.endsWith('\n')).toBe(true);
    const line = JSON.parse(init.body);
    expect(line).toMatchObject({ ua: GPT, path: '/x', status: 200, host: 'example.com' });
  });

  it('uses keepalive when there is no waitUntil', () => {
    report(rq('/x', GPT), { url: 'https://t.example', site: 'demo', token: 't' });
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });

  it('never throws when fetch rejects or throws', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const waits: Promise<unknown>[] = [];
    expect(() => report(rq('/x', GPT), { url: 'https://t.example', site: 'demo', token: 't', waitUntil: (p) => waits.push(p) })).not.toThrow();
    await expect(waits[0]).resolves.toBeUndefined();
    fetchMock.mockImplementation(() => {
      throw new Error('sync');
    });
    expect(() => report(rq('/x', GPT), { url: 'https://t.example', site: 'demo', token: 't' })).not.toThrow();
  });

  it('skips with no fetch when the token or url is missing, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    report(rq('/x', GPT), { url: 'https://t.example', site: 'demo' });
    report(rq('/x', GPT), { site: 'demo', token: 't' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });

  it('reads TRAIL_URL, TRAIL_SITE and TRAIL_CRAWL_TOKEN from the environment', () => {
    vi.stubEnv('TRAIL_URL', 'https://env.example');
    vi.stubEnv('TRAIL_SITE', 'docs');
    vi.stubEnv('TRAIL_CRAWL_TOKEN', 'tk_env');
    report(rq('/x', GPT));
    expect(fetchMock.mock.calls[0][0]).toBe('https://env.example/api/v1/crawls?site=docs');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer tk_env');
    vi.unstubAllEnvs();
  });
});

describe('adapters', () => {
  const fetchMock = vi.fn();
  const opts = { url: 'https://t.example', site: 'demo', token: 'tk_secret_token' };
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const crawlCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/v1/crawls'));

  it('hono reports the real status after next()', async () => {
    const mw = hono(opts);
    const c: any = { req: { raw: rq('/missing', GPT), path: '/missing' }, res: new Response(null, { status: 200 }) };
    await mw(c, async () => {
      c.res = new Response('nope', { status: 404 });
    });
    expect(JSON.parse(crawlCalls()[0][1].body).status).toBe(404);
  });

  it('hono forwards /t/e and does not call next', async () => {
    const mw = hono(opts);
    const next = vi.fn();
    const c: any = { req: { raw: rq('/t/e', CHROME, { method: 'POST', body: '[]' }), path: '/t/e' }, res: undefined };
    const out = await mw(c, next);
    expect(next).not.toHaveBeenCalled();
    expect(out).toBeInstanceOf(Response);
    expect(fetchMock.mock.calls[0][0]).toBe('https://t.example/_t/e');
  });

  it('hono serves the stub without TRAIL_URL', async () => {
    vi.stubEnv('TRAIL_URL', '');
    const mw = hono({});
    const next = vi.fn();
    const c: any = { req: { raw: rq('/t/t.js', CHROME), path: '/t/t.js' }, res: undefined };
    const out = (await mw(c, next)) as Response;
    expect(next).not.toHaveBeenCalled();
    expect(out.status).toBe(200);
    expect(out.headers.get('x-trail-error')).toBe('no-url');
  });

  it('express serves /t/t.x.js', async () => {
    fetchMock.mockResolvedValue(new Response('/*x*/', { status: 200, headers: { 'content-type': 'text/javascript' } }));
    const mw = express(opts);
    const req: any = { method: 'GET', originalUrl: '/t/t.x.js', url: '/t/t.x.js', protocol: 'https', headers: { host: 'example.com', 'user-agent': CHROME } };
    let body = '';
    const done = new Promise<void>((ok) => {
      const res: any = { statusCode: 0, setHeader: vi.fn(), on: vi.fn(), end: (b: Uint8Array) => ((body = new TextDecoder().decode(b)), ok()) };
      mw(req, res, vi.fn());
    });
    await done;
    expect(fetchMock.mock.calls[0][0]).toBe('https://t.example/_t/t.x.js');
    expect(body).toBe('/*x*/');
  });

  it('express reports on finish with res.statusCode', async () => {
    const mw = express(opts);
    const listeners: Record<string, () => void> = {};
    const req: any = { method: 'GET', originalUrl: '/page', url: '/page', protocol: 'https', headers: { host: 'example.com', 'user-agent': GPT }, get: (h: string) => req.headers[h.toLowerCase()] };
    const res: any = { statusCode: 0, on: (ev: string, fn: () => void) => (listeners[ev] = fn) };
    const next = vi.fn();
    mw(req, res, next);
    expect(next).toHaveBeenCalled();
    res.statusCode = 301;
    listeners.finish();
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse(crawlCalls()[0][1].body)).toMatchObject({ status: 301, path: '/page' });
  });

  it('express skips people', () => {
    const mw = express(opts);
    const req: any = { method: 'GET', originalUrl: '/', url: '/', headers: { host: 'example.com', 'user-agent': CHROME } };
    const res: any = { on: vi.fn() };
    mw(req, res, vi.fn());
    expect(res.on).not.toHaveBeenCalled();
  });

  it('withTrail calls ctx.waitUntil and keeps the handler response', async () => {
    const waitUntil = vi.fn();
    const h = withTrail(async (_r: Request, _e: unknown, _c: unknown) => new Response('hi', { status: 201 }), opts);
    const res = await h(rq('/', GPT), {}, { waitUntil });
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('hi');
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(JSON.parse(crawlCalls()[0][1].body).status).toBe(201);
  });

  it('withTrail reads options from the Workers env binding', async () => {
    const h = withTrail(async (_r: Request, _e: unknown, _c: unknown) => new Response('ok'));
    const waitUntil = vi.fn();
    await h(rq('/', GPT), { TRAIL_URL: 'https://w.example', TRAIL_SITE: 'w', TRAIL_CRAWL_TOKEN: 'tk_w' }, { waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(crawlCalls()[0][0]).toBe('https://w.example/api/v1/crawls?site=w');
  });

  it('withTrail forwards /t/t.js without calling the handler', async () => {
    fetchMock.mockResolvedValue(new Response('/*t*/', { status: 200, headers: { 'content-type': 'text/javascript' } }));
    const handler = vi.fn();
    const h = withTrail(handler as unknown as (r: Request, e: unknown, c: unknown) => Response, opts);
    const res = await h(rq('/t/t.js', CHROME), {}, { waitUntil: vi.fn() });
    expect(handler).not.toHaveBeenCalled();
    expect(await res.text()).toBe('/*t*/');
  });
});
