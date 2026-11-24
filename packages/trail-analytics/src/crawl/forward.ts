import { resolve, warnOnce } from './env';
import { trailPath } from './filter';
import { clientAddr, type EdgeGeo } from './ip';
import type { TrailCrawlOptions } from './types';

export type { EdgeGeo } from './ip';
export { edgeGeo } from './ip';

export type ForwardOptions = TrailCrawlOptions & { geo?: EdgeGeo; ip?: string; env?: Record<string, unknown> };

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const enc = (s: string) => new TextEncoder().encode(s);

export interface SignedFields { site: string; t: string; ip: string; geo: string; geoSrc: string; host: string }

/** The §0.12 `X-Trail-Proxy` value. The key is sha256(token); the token itself never leaves. */
export async function proxySignature(token: string, f: SignedFields, body: Uint8Array<ArrayBuffer> | ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', await subtle.digest('SHA-256', enc(token)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const msg = `v1\n${f.site}\n${f.t}\n${f.ip}\n${f.geo}\n${f.geoSrc}\n${f.host}\n${hex(await subtle.digest('SHA-256', body))}`;
  return `v1;k=${token.slice(0, 12)};t=${f.t};s=${hex(await subtle.sign('HMAC', key, enc(msg)))}`;
}

const clean = (v: string | undefined) => (v ?? '').replace(/\|/g, '');
const PASS_JS = ['content-type', 'cache-control', 'etag', 'last-modified', 'expires'];

const NO_URL_STUB = '/* trail-analytics: TRAIL_URL is not set on this server; analytics are off. */';
const PASS_E = ['x-trail-accepted', 'x-trail-rejected', 'x-trail-proxy-status'];
const fail = (e: unknown) => new Response(null, { status: e instanceof Error && e.name === 'TimeoutError' ? 504 : 502 });

/** Serves `/t/t.js`, `/t/t.x.js`, `/t/t.p.js` and `/t/e` from the site's own origin, forwarding beacons to Trail with signed edge geo. Never turns a failure into a 204. */
export async function forward(req: Request, opts: ForwardOptions = {}): Promise<Response> {
  const { url, site, token } = resolve(opts, opts.env);
  const file = trailPath(req);
  if (!file) return new Response(null, { status: 404 });
  if (!url) {
    warnOnce('no-url', 'trail-analytics: TRAIL_URL is not set; /t/* is answering with a no-op tracker and analytics are off.');
    if (file !== 'e') {
      return new Response(req.method === 'HEAD' ? null : NO_URL_STUB, {
        status: 200,
        headers: { 'content-type': 'application/javascript', 'cache-control': 'no-store', 'x-trail-error': 'no-url' },
      });
    }
    return new Response(null, { status: 503, headers: { 'x-trail-error': 'no-url' } });
  }
  if (file !== 'e') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 });
    try {
      const inm = req.headers.get('if-none-match');
      const up = await fetch(`${url}/_t/${file}`, { headers: inm ? { 'if-none-match': inm } : {} });
      const headers = new Headers();
      for (const k of PASS_JS) {
        const v = up.headers.get(k);
        if (v) headers.set(k, v);
      }
      return new Response(req.method === 'HEAD' ? null : up.body, { status: up.status, headers });
    } catch (e) {
      return fail(e);
    }
  }
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  if (!site || !token) {
    warnOnce('unsigned', 'trail-analytics: TRAIL_SITE or TRAIL_CRAWL_TOKEN is not set; beacons are refused (503) instead of forwarded unsigned.');
    return new Response(null, { status: 503, headers: { 'x-trail-error': 'unsigned' } });
  }
  try {
    const body = new Uint8Array(await req.arrayBuffer());
    const h = req.headers;
    const headers = new Headers({ 'content-type': h.get('content-type') ?? 'text/plain;charset=UTF-8' });
    for (const k of ['origin', 'referer', 'user-agent']) {
      const v = h.get(k);
      if (v) headers.set(k, v);
    }
    for (const k of ['signature', 'signature-input', 'signature-agent']) {
      const v = h.get(k);
      if (v) headers.set(k, v.slice(0, 4096));
    }
    const addr = clientAddr(req, { ipHeader: opts.ipHeader, env: opts.env });
    const g = opts.geo ?? addr.geo;
    const f: SignedFields = {
      site,
      t: String(Math.floor(Date.now() / 1000)),
      ip: (opts.ip ?? addr.ip).slice(0, 64),
      geo: g ? [g.country, g.region, g.city].map(clean).join('|').slice(0, 256) : '',
      geoSrc: g?.source ?? '',
      host: (h.get('host') ?? new URL(req.url).host).slice(0, 255),
    };
    headers.set('x-trail-ip', f.ip);
    headers.set('x-trail-geo', f.geo);
    headers.set('x-trail-geo-src', f.geoSrc);
    headers.set('x-trail-host', f.host);
    headers.set('x-trail-proxy', await proxySignature(token, f, body));
    const init: RequestInit = { method: 'POST', headers, body };
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) init.signal = AbortSignal.timeout(5000);
    const up = await fetch(`${url}/_t/e`, init);
    const out = new Headers();
    for (const k of PASS_E) {
      const v = up.headers.get(k);
      if (v) out.set(k, v);
    }
    out.set('x-trail-ip-via', opts.ip ? 'header' : addr.via);
    out.set('x-trail-geo-src', f.geoSrc);
    return new Response(null, { status: up.status, headers: out });
  } catch (e) {
    return fail(e);
  }
}
