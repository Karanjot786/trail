import { test, expect, type Page } from '@playwright/test';

type Ev = Record<string, any>;
const WIRE = new Set(['s', 't', 'a', 'ss', 'uid', 'u', 'r', 'rt', 'n', 'd', 'e', 'sc', 'env', 'w']);

// Intercept the ingest endpoint: record every body, answer 204. No Go server involved.
async function capture(page: Page) {
  const events: Ev[] = [];
  const types: string[] = [];
  await page.route('**/_t/e', async (route) => {
    const req = route.request();
    types.push(req.headers()['content-type'] ?? '');
    events.push(JSON.parse(req.postData() ?? 'null'));
    await route.fulfill({ status: 204 });
  });
  return { events, types, of: (t: string) => events.filter((e) => e.t === t) };
}

const hide = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange')); // non-bubbling on purpose: tracker must listen on document
  });

test('pageview on load: wire contract, text/plain, keepalive transport', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html?utm_source=tw');
  await expect.poll(() => c.of('pageview').length).toBe(1);
  const pv = c.of('pageview')[0];
  expect(Object.keys(pv).every((k) => WIRE.has(k))).toBe(true);
  expect(pv).toMatchObject({ s: 'demo', t: 'pageview', env: 'production', w: 1 });
  expect(pv.u).toBe('http://127.0.0.1:4173/index.html?utm_source=tw');
  expect(pv.a).toMatch(/^[0-9a-f-]{36}$/);
  expect(pv.ss).toMatch(/^[0-9a-f-]{36}$/);
  expect(c.types[0]).toContain('text/plain');
  const cookie = await page.evaluate(() => document.cookie);
  expect(cookie).toContain('_t_id=' + pv.a);
});

test('script included twice -> exactly one pageview (window.__trail guard)', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/dup.html');
  await expect.poll(() => c.of('pageview').length).toBe(1);
  await page.waitForTimeout(300);
  expect(c.of('pageview')).toHaveLength(1);
});

test('localhost without data-dev stays silent', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/nodev.html');
  await page.waitForTimeout(300);
  expect(c.events).toHaveLength(0);
});

test('spa: pushState -> pageview, popstate -> pageview, hash-only -> none', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await expect.poll(() => c.of('pageview').length).toBe(1);

  await page.evaluate(() => history.pushState({}, '', '/a'));
  await expect.poll(() => c.of('pageview').length).toBe(2);
  expect(c.of('pageview')[1].u).toMatch(/\/a$/);
  expect(c.of('pageview')[1].r).toMatch(/\/index\.html$/);

  await page.evaluate(() => history.pushState({}, '', '/b'));
  await expect.poll(() => c.of('pageview').length).toBe(3);

  // hash-only change (pushState with hash, then location.hash): no pageview
  await page.evaluate(() => history.pushState({}, '', '/b#sec'));
  await page.evaluate(() => (location.hash = 'other'));
  await page.waitForTimeout(200);
  expect(c.of('pageview')).toHaveLength(3);

  // back to /b#sec (same path) -> none; back twice more reaches /a -> pageview
  await page.evaluate(() => history.go(-3));
  await expect.poll(() => c.of('pageview').length).toBe(4);
  expect(c.of('pageview')[3].u).toMatch(/\/a$/);
});

test('engage on hide sends e>0 and sc', async ({ page }) => {
  await page.clock.install();
  const c = await capture(page);
  await page.goto('/index.html');
  await expect.poll(() => c.of('pageview').length).toBe(1);
  await page.clock.runFor(500);
  await hide(page);
  await expect.poll(() => c.of('engage').length).toBe(1);
  const en = c.of('engage')[0];
  expect(en.e).toBeGreaterThan(0);
  expect(en.sc).toBeGreaterThan(0);
  expect(en.sc).toBeLessThanOrEqual(100);
  expect(en.u).toMatch(/index\.html$/);
});

test('leave sends exactly one engage (pagehide + visibilitychange hidden)', async ({ page }) => {
  await page.clock.install();
  const c = await capture(page);
  await page.goto('/index.html');
  await expect.poll(() => c.of('pageview').length).toBe(1);
  await page.clock.runFor(500);
  // Chromium fires pagehide first, then visibilitychange; a few ms pass in between
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.clock.runFor(5);
  await hide(page);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect.poll(() => c.of('engage').length).toBeGreaterThan(0);
  await page.waitForTimeout(200);
  expect(c.of('engage')).toHaveLength(1);
});

test('replaceState: new path -> one pageview, same path -> none', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await expect.poll(() => c.of('pageview').length).toBe(1);
  await page.evaluate(() => history.replaceState({}, '', '/r'));
  await expect.poll(() => c.of('pageview').length).toBe(2);
  expect(c.of('pageview')[1].u).toMatch(/\/r$/);
  await page.evaluate(() => history.replaceState({ x: 1 }, '', '/r'));
  await page.waitForTimeout(200);
  expect(c.of('pageview')).toHaveLength(2);
});

test('engage once at 10s of visible time', async ({ page }) => {
  await page.clock.install();
  const c = await capture(page);
  await page.goto('/index.html');
  await expect.poll(() => c.of('pageview').length).toBe(1);
  await page.clock.runFor(9000);
  expect(c.of('engage')).toHaveLength(0);
  await page.clock.runFor(2000);
  await expect.poll(() => c.of('engage').length).toBe(1);
  expect(c.of('engage')[0].e).toBeGreaterThanOrEqual(10000);
  await page.clock.runFor(30000);
  expect(c.of('engage')).toHaveLength(1);
});

test('outbound click sends d.url', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await page.click('#out');
  await expect.poll(() => c.of('outbound').length).toBe(1);
  expect(c.of('outbound')[0].d.url).toBe('https://example.com/x');
  await page.click('#in');
  await page.waitForTimeout(150);
  expect(c.of('outbound')).toHaveLength(1);
});

test('errors capped at 5 per page', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await page.evaluate(() => {
    for (let i = 0; i < 7; i++) setTimeout(() => { throw new Error('boom' + i); });
  });
  await expect.poll(() => c.of('error').length).toBe(5);
  await page.waitForTimeout(200);
  expect(c.of('error')).toHaveLength(5);
  expect(c.of('error')[0].d.message).toBe('Uncaught Error: boom0');
});

test('form submit sends id and never field values', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await page.click('#go');
  await expect.poll(() => c.of('form').length).toBe(1);
  expect(c.of('form')[0].n).toBe('signup');
  expect(JSON.stringify(c.events)).not.toContain('secret@example.com');
});

test('identify: same user keeps anon, other user rotates, reset rotates', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await expect.poll(() => c.of('pageview').length).toBe(1);
  const anon0 = c.of('pageview')[0].a;
  await page.evaluate(() => (window as any).trail.identify('u1'));
  await page.evaluate(() => (window as any).trail.identify('u1'));
  await expect.poll(() => c.of('identify').length).toBe(2);
  const [i1, i2] = c.of('identify');
  expect(i1).toMatchObject({ uid: 'u1', a: anon0 });
  expect(i2.a).toBe(anon0);

  await page.evaluate(() => (window as any).trail.identify('u2'));
  await expect.poll(() => c.of('identify').length).toBe(3);
  const i3 = c.of('identify')[2];
  expect(i3.uid).toBe('u2');
  expect(i3.a).not.toBe(anon0);
  expect(i3.ss).not.toBe(i1.ss);

  await page.evaluate(() => (window as any).trail.reset());
  await page.evaluate(() => (window as any).trail.track('after-reset'));
  await expect.poll(() => c.of('event').length).toBe(1);
  const ev = c.of('event')[0];
  expect(ev.a).not.toBe(i3.a);
  expect(ev.a).not.toBe(anon0);
  expect(ev.uid).toBeUndefined();
});

test('track() carries name and props; later events carry uid', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await page.evaluate(() => (window as any).trail.identify('u9'));
  await page.evaluate(() => (window as any).trail.track('signup', { plan: 'pro' }));
  await expect.poll(() => c.of('event').length).toBe(1);
  expect(c.of('event')[0]).toMatchObject({ n: 'signup', d: { plan: 'pro' }, uid: 'u9' });
});

test('session: 31 min idle -> new ss; new utm_source -> new ss; same utm keeps ss', async ({ page }) => {
  await page.clock.install();
  const c = await capture(page);
  await page.goto('/index.html?utm_source=a');
  await expect.poll(() => c.of('pageview').length).toBe(1);
  const ss0 = c.of('pageview')[0].ss;

  await page.evaluate(() => (window as any).trail.pageview());
  await expect.poll(() => c.of('pageview').length).toBe(2);
  expect(c.of('pageview')[1].ss).toBe(ss0);

  await page.clock.fastForward('31:00');
  await page.evaluate(() => (window as any).trail.pageview());
  await expect.poll(() => c.of('pageview').length).toBe(3);
  const ss1 = c.of('pageview')[2].ss;
  expect(ss1).not.toBe(ss0);

  await page.evaluate(() => history.pushState({}, '', '/x?utm_source=b'));
  await expect.poll(() => c.of('pageview').length).toBe(4);
  expect(c.of('pageview')[3].ss).not.toBe(ss1);
});

test('queued window.trailq calls are flushed; API is exposed', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/queue.html');
  await expect.poll(() => c.of('event').length).toBe(1);
  expect(c.of('event')[0]).toMatchObject({ n: 'early', d: { k: 1 } });
  const keys = await page.evaluate(() => Object.keys((window as any).trail).sort());
  expect(keys).toEqual(['identify', 'pageview', 'reset', 'track']);
});

test('pageview({route}) and data-route fill rt', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await page.evaluate(() => (window as any).trail.pageview({ route: '/blog/[slug]' }));
  await expect.poll(() => c.of('pageview').length).toBe(2);
  expect(c.of('pageview')[1].rt).toBe('/blog/[slug]');
  await page.goto('/full.html');
  await expect.poll(() => c.of('pageview').length).toBe(3);
  expect(c.of('pageview')[2].rt).toBe('/home');
});

test.describe('opt-in vitals and rage clicks (t.x.js)', () => {
  test('rage click: 3 fast clicks -> rage_click event', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/full.html');
    await page.click('#b', { clickCount: 3, delay: 20 });
    await expect.poll(() => c.of('event').filter((e) => e.n === 'rage_click').length).toBe(1);
  });

  test('vitals reported on hide only when data-vitals', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/full.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await hide(page);
    await expect.poll(() => c.of('vital').length).toBeGreaterThan(0);
    expect(c.of('vital').every((v) => ['LCP', 'CLS', 'INP'].includes(v.n) && typeof v.d.value === 'number')).toBe(true);
  });

  test('without the attributes nothing is observed', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/index.html');
    await page.click('#b', { clickCount: 3, delay: 20 });
    await hide(page);
    await page.waitForTimeout(200);
    expect(c.of('vital')).toHaveLength(0);
    expect(c.of('event')).toHaveLength(0);
  });

  test('no extras file is requested without data-vitals/data-rage', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    const c = await capture(page);
    await page.goto('/index.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await page.waitForTimeout(200);
    expect(urls.filter((u) => u.includes('t.x.js'))).toHaveLength(0);
  });

  test('extras file is loaded from next to t.js when asked for', async ({ page }) => {
    const req = page.waitForRequest('**/_t/t.x.js');
    await page.goto('/full.html');
    await req;
  });
});
