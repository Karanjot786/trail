// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { main, type Io } from './index';
import { verify } from './verify';

type Route = { status?: number; body?: string; headers?: Record<string, string> };
function mock(routes: Record<string, Route>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (u: any, init?: RequestInit) => {
    const url = String(u);
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => (init?.method ?? 'GET') + ' ' + url === k) ?? Object.keys(routes).find((k) => url.endsWith(k));
    const r = key ? routes[key] : { status: 404 };
    return new Response(r.status === 204 ? null : (r.body ?? ''), { status: r.status ?? 200, headers: r.headers });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const PAGE = 'https://shop.example.com/';
const TAG = `<html><head><script defer src="/t/t.js" data-site="plumb" data-api="/t/e"></script></head></html>`;
const JS = { headers: { 'content-type': 'application/javascript' }, body: '/*t*/' };
const base = (over: Record<string, Route> = {}) => ({
  '/': { body: TAG, headers: { 'content-type': 'text/html' } },
  '/t/t.js': JS,
  '/t/e': { status: 204, headers: { 'x-trail-accepted': '1', 'x-trail-ip-via': 'cf-connecting-ip', 'x-trail-geo-src': 'cloudflare' } },
  '/robots.txt': { body: 'User-agent: *\nAllow: /\n' },
  ...over,
});
const by = (cs: Awaited<ReturnType<typeof verify>>, n: string) => cs.find((c) => c.name === n)!;

describe('verify', () => {
  it('finds a server-rendered tag', async () => {
    const m = mock(base());
    const cs = await verify({ url: PAGE }, m.f);
    expect(by(cs, 'script').ok).toBe(true);
    expect(by(cs, 'script').detail).toContain('server-rendered tag');
    expect(cs.every((c) => c.ok === true)).toBe(true);
  });

  it('finds the Next component in the flight payload', async () => {
    const flight = `<html><script>self.__next_f.push([1,"{\\"site\\":\\"plumb\\",\\"src\\":\\"/t/t.js\\",\\"api\\":\\"/t/e\\"}"])</script></html>`;
    const m = mock(base({ '/': { body: flight } }));
    const cs = await verify({ url: PAGE }, m.f);
    expect(by(cs, 'script').ok).toBe(true);
    expect(by(cs, 'script').detail).toContain('added in the browser by <Analytics>');
    expect(by(cs, 'tracker').ok).toBe(true);
  });

  it('finds an unescaped flight payload', async () => {
    const flight = `<script>x = {"site":"plumb","src":"/t/t.p.js","api":"/t/e"}</script>`;
    const m = mock(base({ '/': { body: flight }, '/t/t.p.js': JS }));
    expect(by(await verify({ url: PAGE }, m.f), 'script').ok).toBe(true);
  });

  it('fails when there is no Trail script', async () => {
    const m = mock(base({ '/': { body: '<html></html>' } }));
    const c = by(await verify({ url: PAGE }, m.f), 'script');
    expect(c.ok).toBe(false);
    expect(c.detail).toContain('no Trail script found');
  });

  it('posts a w:1 env:verify event to the api with origin and referer', async () => {
    const m = mock(base());
    await verify({ url: PAGE }, m.f);
    const post = m.calls.find((c) => c.init?.method === 'POST')!;
    expect(post.url).toBe('https://shop.example.com/t/e');
    const h = post.init!.headers as Record<string, string>;
    expect(h.origin).toBe('https://shop.example.com');
    expect(h.referer).toBe(PAGE);
    expect(h['content-type']).toBe('text/plain;charset=UTF-8');
    const [ev] = JSON.parse(String(post.init!.body));
    expect(ev).toMatchObject({ s: 'plumb', t: 'event', n: 'trail_verify', u: PAGE, env: 'verify', w: 1, m: 'f' });
    expect(ev.a).toMatch(/^verify[a-z0-9]{12}$/);
  });

  it('sends a Chrome user agent and accept text/html on every request', async () => {
    const m = mock(base());
    await verify({ url: PAGE }, m.f);
    for (const c of m.calls) {
      const h = c.init!.headers as Record<string, string>;
      expect(h['user-agent']).toMatch(/Chrome\//);
      expect(h.accept).toBe('text/html');
    }
  });

  it('--site and --api override what the page says', async () => {
    const m = mock(base({ '/x/e': { status: 204 } }));
    await verify({ url: PAGE, site: 'other', api: '/x/e' }, m.f);
    const post = m.calls.find((c) => c.init?.method === 'POST')!;
    expect(post.url).toBe('https://shop.example.com/x/e');
    expect(JSON.parse(String(post.init!.body))[0].s).toBe('other');
  });

  it('reports the stub tracker as TRAIL_URL missing', async () => {
    const m = mock(base({ '/t/t.js': { ...JS, headers: { 'content-type': 'application/javascript', 'x-trail-error': 'no-url' } } }));
    const c = by(await verify({ url: PAGE }, m.f), 'tracker');
    expect(c.ok).toBe(false);
    expect(c.detail).toContain('TRAIL_URL is not set on the server');
  });

  it('reports 403 origin', async () => {
    const m = mock(base({ '/t/e': { status: 403 } }));
    const c = by(await verify({ url: PAGE }, m.f), 'event');
    expect(c.ok).toBe(false);
    expect(c.detail).toBe('origin shop.example.com is not allowed for site plumb (Trail → Settings → Websites)');
  });

  it('reports 400 body, 503 unsigned and 502', async () => {
    expect(by(await verify({ url: PAGE }, mock(base({ '/t/e': { status: 400, body: 'bad site' } })).f), 'event').detail).toContain('bad site');
    expect(by(await verify({ url: PAGE }, mock(base({ '/t/e': { status: 503, headers: { 'x-trail-error': 'unsigned' } } })).f), 'event').detail).toContain('TRAIL_SITE or TRAIL_CRAWL_TOKEN missing on the server');
    expect(by(await verify({ url: PAGE }, mock(base({ '/t/e': { status: 502 } })).f), 'event').detail).toContain("the site's proxy cannot reach Trail");
  });

  it('reports a revoked token from x-trail-proxy-status', async () => {
    const m = mock(base({ '/t/e': { status: 204, headers: { 'x-trail-proxy-status': 'invalid', 'x-trail-ip-via': 'x', 'x-trail-geo-src': 'y' } } }));
    const c = by(await verify({ url: PAGE }, m.f), 'event');
    expect(c.ok).toBe(false);
    expect(c.detail).toContain('the crawl token was rejected (revoked or for another site); visitors are recorded with your server');
  });

  it('a missing x-trail-proxy-status is not an error', async () => {
    const c = by(await verify({ url: PAGE }, mock(base()).f), 'event');
    expect(c.ok).toBe(true);
    expect(c.detail).toContain('ip via cf-connecting-ip, geo source cloudflare');
  });

  it('warns when the ip came from xff or none', async () => {
    const m = mock(base({ '/t/e': { status: 204, headers: { 'x-trail-ip-via': 'xff', 'x-trail-geo-src': 'none' } } }));
    expect(by(await verify({ url: PAGE }, m.f), 'event').ok).toBe('warn');
  });

  it('reports a Cloudflare challenge', async () => {
    const m = mock(base({ '/': { status: 403, headers: { server: 'cloudflare', 'cf-mitigated': 'challenge' } } }));
    const cs = await verify({ url: PAGE }, m.f);
    expect(cs).toHaveLength(1);
    expect(cs[0].ok).toBe(false);
    expect(cs[0].detail).toContain('Cloudflare bot protection blocked the check');
  });

  it('warns on robots Disallow for GPTBot', async () => {
    const m = mock(base({ '/robots.txt': { body: 'User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n' } }));
    const c = by(await verify({ url: PAGE }, m.f), 'robots');
    expect(c.ok).toBe('warn');
    expect(c.detail).toContain('GPTBot');
  });

  it('robots: an allow-all file is ok, a missing file is ok', async () => {
    expect(by(await verify({ url: PAGE }, mock(base()).f), 'robots').ok).toBe(true);
    expect(by(await verify({ url: PAGE }, mock(base({ '/robots.txt': { status: 404 } })).f), 'robots').ok).toBe(true);
  });
});

describe('main verify', () => {
  const io = (f: typeof fetch) => {
    const out: string[] = [];
    const err: string[] = [];
    const i: Io = { stdout: (s) => out.push(s), stderr: (s) => err.push(s), isTTY: false, ask: async () => false, spawn: async () => 0, env: {}, readStdin: async () => '', askSecret: async () => '', fetch: f };
    return { i, out, err };
  };
  it('exit code 0 when all ok, 1 on any FAIL, prints ok/warn/FAIL lines', async () => {
    const good = io(mock(base()).f);
    expect(await main(['verify', '--url', PAGE], good.i)).toBe(0);
    expect(good.out.join('')).toMatch(/^ok\s+page/m);
    const bad = io(mock(base({ '/t/e': { status: 403 } })).f);
    expect(await main(['verify', '--url', PAGE], bad.i)).toBe(1);
    expect(bad.out.join('')).toMatch(/^FAIL\s+event/m);
  });
  it('--json prints the checks array', async () => {
    const r = io(mock(base()).f);
    await main(['verify', '--url', PAGE, '--json'], r.i);
    const j = JSON.parse(r.out.join(''));
    expect(j.map((c: any) => c.name)).toEqual(['page', 'script', 'tracker', 'event', 'robots']);
  });
  it('needs --url', async () => {
    const r = io(mock(base()).f);
    expect(await main(['verify'], r.i)).toBe(1);
    expect(r.err.join('')).toContain('--url');
  });
});
