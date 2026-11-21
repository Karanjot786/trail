// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { proxySignature } from '../src/crawl/forward';
// @ts-expect-error plain .mjs helper
import { verifyProxy } from './mock-trail.mjs';

describe('mock Trail proxy check', () => {
  const token = 'tk_smoke_0123456789';
  const f = { site: 'demo', t: String(Math.floor(Date.now() / 1000)), ip: '203.0.113.7', geo: 'IN|MH|Mumbai', geoSrc: 'vercel', host: 'shop.example' };
  const body = new TextEncoder().encode('[{"s":"demo"}]');
  const headers = async (over: Record<string, string> = {}) => ({ 'x-trail-proxy': await proxySignature(token, f, body), 'x-trail-ip': f.ip, 'x-trail-geo': f.geo, 'x-trail-geo-src': f.geoSrc, 'x-trail-host': f.host, ...over });

  it('accepts what forward signs', async () => {
    expect(verifyProxy(await headers(), Buffer.from(body), { token, site: 'demo' })).toBe('');
  });
  it('rejects a changed geo, body, site, token or an old timestamp', async () => {
    expect(verifyProxy(await headers({ 'x-trail-geo': 'US||' }), Buffer.from(body), { token, site: 'demo' })).toBe('hmac');
    expect(verifyProxy(await headers(), Buffer.from('[]'), { token, site: 'demo' })).toBe('hmac');
    expect(verifyProxy(await headers(), Buffer.from(body), { token, site: 'docs' })).toBe('hmac');
    expect(verifyProxy(await headers(), Buffer.from(body), { token: 'tk_other_0123456789', site: 'demo' })).toBe('prefix');
    expect(verifyProxy(await headers(), Buffer.from(body), { token, site: 'demo', now: Date.now() / 1000 + 301 })).toBe('stale');
  });
});
