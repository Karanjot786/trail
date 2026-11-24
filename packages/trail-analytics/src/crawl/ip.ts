import { env, warnOnce } from './env';
import { CLOUDFLARE_PREFIXES } from './cloudflare.gen';

export interface EdgeGeo { country?: string; region?: string; city?: string; source: 'vercel' | 'cloudflare' | 'netlify' }
export type IpVia = 'vercel' | 'netlify' | 'cloudflare' | 'header' | 'xff' | 'none';
export interface ClientAddr { ip: string; via: IpVia; geo?: EdgeGeo }

const dec = (v: string | null) => {
  if (!v) return '';
  try {
    return decodeURIComponent(v);
  } catch {
    return '';
  }
};

/** Location the host's edge attached to the request: Cloudflare `req.cf`, then Vercel, then Netlify headers. */
export function edgeGeo(req: Request): EdgeGeo | undefined {
  const cf = (req as { cf?: Record<string, unknown> }).cf;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  if (cf && (cf.country || cf.city)) return { country: s(cf.country), region: s(cf.regionCode), city: s(cf.city), source: 'cloudflare' };
  const h = req.headers;
  const vc = h.get('x-vercel-ip-country');
  if (vc) return { country: vc, region: h.get('x-vercel-ip-country-region') ?? '', city: dec(h.get('x-vercel-ip-city')), source: 'vercel' };
  const nf = h.get('x-nf-geo');
  if (nf) {
    try {
      const g = JSON.parse(atob(nf));
      return { country: s(g?.country?.code), region: s(g?.subdivision?.code), city: s(g?.city), source: 'netlify' };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** An address as 4 (IPv4) or 16 (IPv6) bytes, or null. IPv4-mapped IPv6 is unwrapped to IPv4. */
function parseIp(raw: string): Uint8Array | null {
  const s = raw.trim();
  const v4 = (t: string): number[] | null => {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(t);
    if (!m) return null;
    const o = m.slice(1).map(Number);
    return o.every((n) => n <= 255) ? o : null;
  };
  const a = v4(s);
  if (a) return Uint8Array.from(a);
  if (!s.includes(':') || !/^[0-9a-fA-F:.]+$/.test(s)) return null;
  let head = s;
  let tail = '';
  const dc = s.indexOf('::');
  if (dc >= 0) {
    if (s.indexOf('::', dc + 1) >= 0) return null;
    head = s.slice(0, dc);
    tail = s.slice(dc + 2);
  }
  const groups = (t: string): number[] | null => {
    if (t === '') return [];
    const out: number[] = [];
    const parts = t.split(':');
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === parts.length - 1 && p.includes('.')) {
        const o = v4(p);
        if (!o) return null;
        out.push((o[0] << 8) | o[1], (o[2] << 8) | o[3]);
      } else if (/^[0-9a-fA-F]{1,4}$/.test(p)) out.push(parseInt(p, 16));
      else return null;
    }
    return out;
  };
  const h = groups(head);
  const t = groups(tail);
  if (!h || !t) return null;
  let g: number[];
  if (dc >= 0) {
    const fill = 8 - h.length - t.length;
    if (fill < 1) return null;
    g = [...h, ...Array<number>(fill).fill(0), ...t];
  } else g = h;
  if (g.length !== 8) return null;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return Uint8Array.from([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  const out = new Uint8Array(16);
  g.forEach((x, i) => ((out[i * 2] = x >> 8), (out[i * 2 + 1] = x & 255)));
  return out;
}

const NETS = CLOUDFLARE_PREFIXES.flatMap((c) => {
  const [addr, bits] = c.split('/');
  const b = parseIp(addr);
  return b ? [{ b, bits: Number(bits) }] : [];
});

/** True when `ip` (v4, v6 or IPv4-mapped v6) is inside a published Cloudflare range. */
export function isCloudflareIp(ip: string): boolean {
  const b = parseIp(ip);
  if (!b) return false;
  return NETS.some((n) => {
    if (n.b.length !== b.length) return false;
    let bits = n.bits;
    for (let i = 0; bits > 0; i++, bits -= 8) {
      const mask = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
      if ((b[i] & mask) !== (n.b[i] & mask)) return false;
    }
    return true;
  });
}

const first = (v: string | null | undefined) => (v ?? '').split(',')[0].trim();

/** Strips a :port from IPv4 or a bracketed IPv6 (cloudfront-viewer-address). Bare IPv6 is left alone. */
function stripPort(v: string): string {
  const br = /^\[([^\]]+)\](?::\d+)?$/.exec(v);
  if (br) return br[1];
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) return v.slice(0, v.lastIndexOf(':'));
  return v;
}

const cfGeo = (h: Headers): EdgeGeo | undefined => {
  const c = h.get('cf-ipcountry')?.trim().toUpperCase();
  if (!c || c === 'XX' || c === 'T1') return undefined;
  return { country: c, region: h.get('cf-region-code')?.trim() ?? '', city: dec(h.get('cf-ipcity')), source: 'cloudflare' };
};

const cap = (s: string) => s.slice(0, 64);

/**
 * The trusted client address and edge geo. Order: explicit header (TRAIL_IP_HEADER), Cloudflare Worker,
 * Vercel / Netlify peer header (with cf-connecting-ip only when that peer is Cloudflare), then unknown platform.
 */
export function clientAddr(req: Request, o: { ipHeader?: string; env?: Record<string, unknown> } = {}): ClientAddr {
  const h = req.headers;
  const ipHeader = o.ipHeader ?? env('TRAIL_IP_HEADER', o.env);
  if (ipHeader) {
    const v = stripPort(first(h.get(ipHeader)));
    if (v) return { ip: cap(v), via: 'header', geo: edgeGeo(req) };
  }
  const cfc = h.get('cf-connecting-ip')?.trim() ?? '';
  if ((req as { cf?: unknown }).cf && cfc) return { ip: cap(cfc), via: 'cloudflare', geo: edgeGeo(req) };
  const xff = (h.get('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const platform = (peerHeader: string, via: 'vercel' | 'netlify'): ClientAddr | undefined => {
    const peer = h.get(peerHeader)?.trim() ?? '';
    if (!peer) return undefined;
    if (isCloudflareIp(peer) && cfc) return { ip: cap(cfc), via: 'cloudflare', geo: cfGeo(h) };
    return { ip: cap(peer), via, geo: edgeGeo(req) };
  };
  if (h.has('x-vercel-ip-country') || h.has('x-vercel-id')) {
    const r = platform('x-real-ip', 'vercel');
    if (r) return r;
  }
  if (h.has('x-nf-client-connection-ip')) {
    const r = platform('x-nf-client-connection-ip', 'netlify');
    if (r) return r;
  }
  if (cfc && xff.some(isCloudflareIp)) return { ip: cap(cfc), via: 'cloudflare', geo: cfGeo(h) };
  if (xff.length) {
    warnOnce('ip', 'trail-analytics: no platform IP header; client IPs can be spoofed. Set TRAIL_IP_HEADER (README, Client IP).');
    return { ip: cap(xff[0]), via: 'xff', geo: edgeGeo(req) };
  }
  const real = h.get('x-real-ip')?.trim();
  if (real) return { ip: cap(real), via: 'xff', geo: edgeGeo(req) };
  return { ip: '', via: 'none', geo: edgeGeo(req) };
}
