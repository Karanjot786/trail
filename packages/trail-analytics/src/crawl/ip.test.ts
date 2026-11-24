// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOUDFLARE_PREFIXES } from './cloudflare.gen';
import { clientAddr, isCloudflareIp } from './ip';

const rq = (headers: Record<string, string>) => new Request('https://shop.example/t/e', { method: 'POST', headers });

describe('clientAddr', () => {
  afterEach(() => vi.unstubAllEnvs());
  const cases: [string, Record<string, string>, { ip: string; via: string; geo?: object }][] = [
    ['vercel plain', { 'x-vercel-id': 'a', 'x-real-ip': '49.36.1.2', 'x-vercel-ip-country': 'IN', 'x-vercel-ip-city': 'Pune' }, { ip: '49.36.1.2', via: 'vercel', geo: { country: 'IN', city: 'Pune', source: 'vercel' } }],
    [
      'cloudflare in front of vercel (termui)',
      { 'x-vercel-id': 'a', 'x-real-ip': '172.70.1.1', 'x-vercel-ip-country': 'US', 'cf-connecting-ip': '49.36.1.2', 'cf-ipcountry': 'IN', 'cf-region-code': 'MH', 'cf-ipcity': 'Mumbai' },
      { ip: '49.36.1.2', via: 'cloudflare', geo: { country: 'IN', region: 'MH', city: 'Mumbai', source: 'cloudflare' } },
    ],
    ['cf in front, no location transform', { 'x-vercel-id': 'a', 'x-real-ip': '172.70.1.1', 'cf-connecting-ip': '49.36.1.2', 'cf-ipcountry': 'IN' }, { ip: '49.36.1.2', via: 'cloudflare', geo: { country: 'IN', region: '', city: '', source: 'cloudflare' } }],
    ['cf in front, country XX gives no geo', { 'x-vercel-id': 'a', 'x-real-ip': '172.70.1.1', 'cf-connecting-ip': '49.36.1.2', 'cf-ipcountry': 'XX', 'x-vercel-ip-country': 'US' }, { ip: '49.36.1.2', via: 'cloudflare' }],
    ['vercel, spoofed cf-connecting-ip from a non-CF peer', { 'x-vercel-id': 'a', 'x-real-ip': '49.36.1.2', 'cf-connecting-ip': '1.1.1.1' }, { ip: '49.36.1.2', via: 'vercel' }],
    ['aws behind cloudflare (genzcareer)', { 'x-forwarded-for': '49.36.1.2, 172.70.1.1', 'cf-connecting-ip': '49.36.1.2', 'cf-ipcountry': 'IN' }, { ip: '49.36.1.2', via: 'cloudflare', geo: { country: 'IN', source: 'cloudflare' } }],
    ['self-hosted spoof', { 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '5.5.5.5' }, { ip: '5.5.5.5', via: 'xff' }],
    ['netlify plain', { 'x-nf-client-connection-ip': '49.36.1.2' }, { ip: '49.36.1.2', via: 'netlify' }],
    ['x-real-ip only', { 'x-real-ip': '7.7.7.7' }, { ip: '7.7.7.7', via: 'xff' }],
    ['nothing', {}, { ip: '', via: 'none' }],
  ];
  it.each(cases)('%s', (_n, headers, want) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = clientAddr(rq(headers));
    expect(r.ip).toBe(want.ip);
    expect(r.via).toBe(want.via);
    if (want.geo) expect(r.geo).toMatchObject(want.geo);
    else if (want.via === 'cloudflare') expect(r.geo).toBeUndefined();
  });

  it('TRAIL_IP_HEADER strips the port', () => {
    expect(clientAddr(rq({ 'cloudfront-viewer-address': '49.36.1.2:51234' }), { ipHeader: 'cloudfront-viewer-address' })).toMatchObject({ ip: '49.36.1.2', via: 'header' });
    expect(clientAddr(rq({ 'cloudfront-viewer-address': '[2405:201::1]:443' }), { ipHeader: 'cloudfront-viewer-address' }).ip).toBe('2405:201::1');
    expect(clientAddr(rq({ 'x-my-ip': '2405:201::1' }), { ipHeader: 'x-my-ip' }).ip).toBe('2405:201::1');
    expect(clientAddr(rq({ 'x-my-ip': '8.8.8.8, 1.1.1.1' }), { env: { TRAIL_IP_HEADER: 'x-my-ip' } }).ip).toBe('8.8.8.8');
  });

  it('Cloudflare Worker req.cf wins', () => {
    const r = Object.assign(rq({ 'cf-connecting-ip': '49.36.1.2' }), { cf: { country: 'IN', city: 'Pune', regionCode: 'MH' } });
    expect(clientAddr(r)).toMatchObject({ ip: '49.36.1.2', via: 'cloudflare', geo: { country: 'IN', source: 'cloudflare' } });
  });
});

describe('isCloudflareIp', () => {
  it.each([
    ['173.245.48.1', true],
    ['2400:cb00::1', true],
    ['::ffff:104.16.0.1', true],
    ['8.8.8.8', false],
    ['garbage', false],
    ['', false],
  ])('%s', (ip, want) => expect(isCloudflareIp(ip)).toBe(want));
});

describe('cloudflare.gen.ts', () => {
  it('matches internal/netx/*.txt', () => {
    const dir = resolve(__dirname, '../../../../internal/netx');
    if (!existsSync(resolve(dir, 'cloudflare-v4.txt'))) return;
    const read = (f: string) => readFileSync(resolve(dir, f), 'utf8').split(/\s+/).filter(Boolean);
    expect(new Set(CLOUDFLARE_PREFIXES)).toEqual(new Set([...read('cloudflare-v4.txt'), ...read('cloudflare-v6.txt')]));
  });
});
