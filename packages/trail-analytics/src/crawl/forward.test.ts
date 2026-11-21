// @vitest-environment node
import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { edgeGeo, forward, proxySignature } from './index';

const TOKEN = 'tk_live_abcdefghijklmnop';
const opts = { url: 'https://trail.example', site: 'demo', token: TOKEN };

/** Independent §0.12 check, written from the spec with node:crypto. */
function expectedSig(site: string, t: string, ip: string, geo: string, src: string, host: string, body: string): string {
  const key = createHash('sha256').update(TOKEN).digest();
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return createHmac('sha256', key).update(`v1\n${site}\n${t}\n${ip}\n${geo}\n${src}\n${host}\n${bodyHash}`).digest('hex');
}

function parseProxy(h: string | null) {
  const m = /^v1;k=([^;]+);t=(\d+);s=([0-9a-f]{64})$/.exec(h ?? '');
  if (!m) throw new Error('bad X-Trail-Proxy: ' + h);
  return { k: m[1], t: m[2], s: m[3] };
}

const beacon = (headers: Record<string, string> = {}, body = '[{"s":"demo","n":"pageview"}]', extra: object = {}) =>
  Object.assign(
    new Request('https://shop.example/t/e', {
      method: 'POST',
      body,
      headers: { host: 'shop.example', 'user-agent': 'UA', origin: 'https://shop.example', referer: 'https://shop.example/a', 'content-type': 'text/plain;charset=UTF-8', ...headers },
    }),
    extra,
  );

describe('edgeGeo', () => {
  it('reads Vercel headers and decodes the city', () => {
    const r = new Request('https://x/', { headers: { 'x-vercel-ip-country': 'BR', 'x-vercel-ip-country-region': 'SP', 'x-vercel-ip-city': 'S%C3%A3o%20Paulo' } });
    expect(edgeGeo(r)).toEqual({ country: 'BR', region: 'SP', city: 'São Paulo', source: 'vercel' });
  });
  it('prefers req.cf over headers', () => {
    const r = Object.assign(new Request('https://x/', { headers: { 'x-vercel-ip-country': 'BR' } }), { cf: { country: 'IN', regionCode: 'MH', city: 'Mumbai' } });
    expect(edgeGeo(r)).toEqual({ country: 'IN', region: 'MH', city: 'Mumbai', source: 'cloudflare' });
  });
  it('reads Netlify x-nf-geo', () => {
    const g = Buffer.from(JSON.stringify({ city: 'Pune', country: { code: 'IN', name: 'India' }, subdivision: { code: 'MH', name: 'Maharashtra' } })).toString('base64');
    expect(edgeGeo(new Request('https://x/', { headers: { 'x-nf-geo': g } }))).toEqual({ country: 'IN', region: 'MH', city: 'Pune', source: 'netlify' });
  });
  it('returns undefined with no edge data or a broken city', () => {
    expect(edgeGeo(new Request('https://x/'))).toBeUndefined();
    expect(edgeGeo(new Request('https://x/', { headers: { 'x-nf-geo': '!!notbase64' } }))).toBeUndefined();
    expect(edgeGeo(new Request('https://x/', { headers: { 'x-vercel-ip-country': 'US', 'x-vercel-ip-city': '%E0%A4%A' } }))?.city).toBe('');
  });
});

describe('forward', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('signs a beacon with edge geo per §0.12 and keeps the body', async () => {
    const body = '[{"s":"demo","n":"pageview","u":"https://shop.example/a"}]';
    const res = await forward(beacon({ 'x-vercel-ip-country': 'IN', 'x-vercel-ip-country-region': 'MH', 'x-vercel-ip-city': 'Navi%20Mumbai', 'x-real-ip': '49.36.1.2', 'x-forwarded-for': '49.36.1.2, 10.0.0.1' }, body), opts);
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://trail.example/_t/e');
    expect(init.method).toBe('POST');
    const h = new Headers(init.headers);
    expect(new TextDecoder().decode(init.body)).toBe(body);
    expect(h.get('x-trail-ip')).toBe('49.36.1.2');
    expect(h.get('x-trail-geo')).toBe('IN|MH|Navi Mumbai');
    expect(h.get('x-trail-geo-src')).toBe('vercel');
    expect(h.get('x-trail-host')).toBe('shop.example');
    expect(h.get('origin')).toBe('https://shop.example');
    expect(h.get('referer')).toBe('https://shop.example/a');
    expect(h.get('user-agent')).toBe('UA');
    const p = parseProxy(h.get('x-trail-proxy'));
    expect(p.k).toBe(TOKEN.slice(0, 12));
    expect(Math.abs(Number(p.t) - Date.now() / 1000)).toBeLessThan(5);
    expect(p.s).toBe(expectedSig('demo', p.t, '49.36.1.2', 'IN|MH|Navi Mumbai', 'vercel', 'shop.example', body));
  });

  it('never sends the token in any header', async () => {
    await forward(beacon({ authorization: 'Bearer x' }), opts);
    const h = new Headers(fetchMock.mock.calls[0][1].headers);
    h.forEach((v) => expect(v.includes(TOKEN)).toBe(false));
    expect(h.get('authorization')).toBeNull();
  });

  it('signs with an empty geo when there is none', async () => {
    const body = '[]';
    await forward(beacon({}, body), opts);
    const h = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(h.get('x-trail-geo')).toBe('');
    expect(h.get('x-trail-geo-src')).toBe('');
    const p = parseProxy(h.get('x-trail-proxy'));
    expect(p.s).toBe(expectedSig('demo', p.t, '', '', '', 'shop.example', body));
  });

  it('strips | from geo values and uses opts.geo when given', async () => {
    await forward(beacon(), { ...opts, geo: { country: 'US', region: 'C|A', city: 'San|Jose', source: 'cloudflare' } });
    const h = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(h.get('x-trail-geo')).toBe('US|CA|SanJose');
    expect(h.get('x-trail-geo-src')).toBe('cloudflare');
  });

  it('copies Signature headers', async () => {
    await forward(beacon({ signature: 'sig1=:AA==:', 'signature-input': 'sig1=("@authority");created=1', 'signature-agent': '"https://chatgpt.com"' }), opts);
    const h = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(h.get('signature')).toBe('sig1=:AA==:');
    expect(h.get('signature-input')).toBe('sig1=("@authority");created=1');
    expect(h.get('signature-agent')).toBe('"https://chatgpt.com"');
  });

  it('answers 204 when Trail is down', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const res = await forward(beacon(), opts);
    expect(res.status).toBe(204);
  });

  it('proxies /t/t.js with its cache headers', async () => {
    fetchMock.mockResolvedValue(new Response('/*tracker*/', { status: 200, headers: { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=300', etag: '"v1"', 'set-cookie': 'x=1' } }));
    const res = await forward(new Request('https://shop.example/t/t.js'), opts);
    expect(fetchMock.mock.calls[0][0]).toBe('https://trail.example/_t/t.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('/*tracker*/');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
    expect(res.headers.get('etag')).toBe('"v1"');
    expect(res.headers.get('content-type')).toBe('text/javascript');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('answers 404 for other /t paths and 405 for GET /t/e', async () => {
    expect((await forward(new Request('https://shop.example/t/other'), opts)).status).toBe(404);
    expect((await forward(new Request('https://shop.example/t/e'), opts)).status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards unsigned when the token or site is missing', async () => {
    await forward(beacon(), { url: 'https://trail.example' });
    const h = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(h.get('x-trail-proxy')).toBeNull();
  });

  it('matches the Go vector when G-1 has committed it', async () => {
    const file = resolve(__dirname, '../../../../internal/edgegeo/testdata/proxy-vector.json');
    if (!existsSync(file)) return;
    const v = JSON.parse(readFileSync(file, 'utf8'));
    const s = await proxySignature(v.token, { site: v.site, t: String(v.t), ip: v.ip, geo: v.geo, geoSrc: v.geoSrc, host: v.host }, new TextEncoder().encode(v.body));
    expect(s).toBe(v.header ?? v.s);
  });
});
