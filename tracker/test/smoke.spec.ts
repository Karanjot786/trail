import { test, expect, type Page } from '@playwright/test';

type Ev = Record<string, any>;
const WIRE = new Set(['s', 't', 'a', 'ss', 'uid', 'u', 'r', 'rt', 'n', 'd', 'e', 'sc', 'env', 'w', 'm', 'rc', 'c', 'k']);

// Intercept the ingest endpoint (fetch and sendBeacon): record every event of every body
// (one object or a batch array) and every request; answer 204, or the next of `statuses`.
async function capture(page: Page, statuses: number[] = [], headers: Record<string, string> = {}, delay = 0) {
  const events: Ev[] = [];
  const reqs: Ev[][] = [];
  const types: string[] = [];
  await page.route('**/_t/e', async (route) => {
    const req = route.request();
    types.push(req.headers()['content-type'] ?? '');
    const body = JSON.parse(req.postData() ?? 'null');
    const batch = Array.isArray(body) ? body : [body];
    reqs.push(batch);
    events.push(...batch);
    if (delay && !reqs.slice(1).length) await new Promise((r) => setTimeout(r, delay)); // first request only
    await route.fulfill({ status: statuses.shift() ?? 204, headers });
  });
  return { events, reqs, types, of: (t: string) => events.filter((e) => e.t === t) };
}

const hide = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange')); // non-bubbling on purpose: tracker must listen on document
  });

// hidden, then visible again: the tracker flushes its queue on hide and keeps running
const cycle = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    delete (document as any).visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });

test('pageview on load: wire contract, text/plain, keepalive transport', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html?utm_source=tw');
  await expect.poll(() => c.of('pageview').length).toBe(1);
  const pv = c.of('pageview')[0];
  expect(Object.keys(pv).every((k) => WIRE.has(k))).toBe(true);
  expect(pv).toMatchObject({ s: 'demo', t: 'pageview', env: 'production', w: 1 });
  expect(pv.u).toBe('http://127.0.0.1:4173/index.html?utm_source=tw');
  expect(pv.a).toMatch(/^[0-9a-f]{14,41}$/);
  expect(pv.ss).toMatch(/^[0-9a-f]{14,41}$/);
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

test('event age: a track() call waiting for the leave beacon reports its age', async ({ page }) => {
  await page.clock.install();
  const c = await capture(page);
  await page.goto('/index.html');
  await expect.poll(() => c.of('pageview').length).toBe(1);
  await page.evaluate(() => (window as any).trail.track('x'));
  await page.clock.runFor(60000);
  await hide(page);
  await expect.poll(() => c.of('event').length).toBe(1);
  const age = c.of('event')[0].c;
  expect(age).toBeGreaterThanOrEqual(60000);
  expect(age).toBeLessThan(61000);
  expect(c.of('pageview')[0].c).toBeLessThan(1000);
});

test('user prop named c is not rewritten', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await expect.poll(() => c.of('pageview').length).toBe(1);
  await page.evaluate(() => (window as any).trail.track('x', { c: 5 }));
  await hide(page);
  await expect.poll(() => c.of('event').length).toBe(1);
  expect(c.of('event')[0].d.c).toBe(5);
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

test('engage at 10s of visible time is queued, then sent with the leave batch', async ({ page }) => {
  await page.clock.install();
  const c = await capture(page);
  await page.goto('/index.html');
  await expect.poll(() => c.of('pageview').length).toBe(1);
  await page.clock.runFor(11000);
  await page.waitForTimeout(100);
  expect(c.reqs).toHaveLength(1);
  await hide(page);
  await expect.poll(() => c.reqs.length).toBe(2);
  expect(c.of('engage')[0].e).toBeGreaterThanOrEqual(10000);
});

test('outbound click sends d.url', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await page.click('#out');
  await page.click('#in');
  await hide(page);
  await expect.poll(() => c.of('outbound').length).toBe(1);
  expect(c.of('outbound')[0].d.url).toBe('https://example.com/x');
});

test('errors capped at 5 per page', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await page.evaluate(() => {
    for (let i = 0; i < 7; i++) setTimeout(() => { throw new Error('boom' + i); });
  });
  await page.waitForTimeout(200);
  await hide(page);
  await expect.poll(() => c.of('error').length).toBe(5);
  expect(c.of('error')[0].d.message).toBe('Uncaught Error: boom0');
});

test('form submit sends id and never field values', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await page.click('#go');
  await hide(page);
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
  await cycle(page);
  await expect.poll(() => c.of('identify').length).toBe(2);
  const [i1, i2] = c.of('identify');
  expect(i1).toMatchObject({ uid: 'u1', a: anon0 });
  expect(i2.a).toBe(anon0);

  await page.evaluate(() => (window as any).trail.identify('u2'));
  await cycle(page);
  await expect.poll(() => c.of('identify').length).toBe(3);
  const i3 = c.of('identify')[2];
  expect(i3.uid).toBe('u2');
  expect(i3.a).not.toBe(anon0);
  expect(i3.ss).not.toBe(i1.ss);

  await page.evaluate(() => (window as any).trail.reset());
  await page.evaluate(() => (window as any).trail.track('after-reset'));
  await hide(page);
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
  await hide(page);
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
  await expect.poll(() => c.of('pageview').length).toBe(1);
  await hide(page);
  await expect.poll(() => c.of('event').length).toBe(1);
  expect(c.of('event')[0]).toMatchObject({ n: 'early', d: { k: 1 } });
  const keys = await page.evaluate(() => Object.keys((window as any).trail).sort());
  expect(keys).toEqual(['consent', 'identify', 'pageview', 'reset', 'track']);
});

test('pageview({route}) and data-route fill rt', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await page.evaluate(() => (window as any).trail.pageview({ route: '/blog/[slug]' }));
  await expect.poll(() => c.of('pageview').length).toBe(2);
  expect(c.of('pageview')[1].rt).toBe('/blog/[slug]');
  await page.goto('/extras.html');
  await expect.poll(() => c.of('pageview').length).toBe(3);
  expect(c.of('pageview')[2].rt).toBe('/home');
});

test('form with inputs named id/name still sends the form id as a string', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<form id="contact" onsubmit="return false"><input name="name"><input name="id"><button id="cb">go</button></form>');
  });
  await page.click('#cb');
  await hide(page);
  await expect.poll(() => c.of('form').length).toBe(1);
  expect(c.of('form')[0].n).toBe('contact');
});

test('identify(123) sends uid as a string', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/index.html');
  await trail(page, 'identify', 123);
  await hide(page);
  await expect.poll(() => c.of('identify').length).toBe(1);
  expect(c.of('identify')[0].uid).toBe('123');
});

test('forms and errors are opt-in (data-forms, data-errors)', async ({ page }) => {
  const c = await capture(page);
  await page.setContent('<p>x</p>'); // blank first, so goto below is a fresh load
  await page.goto('/full.html');
  await expect.poll(() => c.of('pageview').length).toBe(1);
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<form id="f" onsubmit="return false"><button id="fb">go</button></form>');
  });
  await page.click('#fb');
  await page.addScriptTag({ content: 'throw new Error("nope")' });
  await hide(page);
  await page.waitForTimeout(200);
  expect(c.of('form')).toHaveLength(0);
  expect(c.of('error')).toHaveLength(0);
});

test.describe('delivery: batching, beacon, retry', () => {
  test('pageview is sent immediately (own request)', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/index.html');
    await expect.poll(() => c.reqs.length).toBe(1);
    expect(c.reqs[0].map((e) => e.t)).toEqual(['pageview']);
  });

  test('track + outbound + error wait for leave, then go as one request with the engage', async ({ page }) => {
    await page.clock.install();
    const c = await capture(page);
    await page.goto('/index.html');
    await expect.poll(() => c.reqs.length).toBe(1);
    await page.evaluate(() => (window as any).trail.track('t1'));
    await page.click('#out');
    await page.addScriptTag({ content: 'throw new Error("e1")' });
    await page.clock.runFor(500);
    await page.waitForTimeout(100);
    expect(c.reqs).toHaveLength(1);
    await hide(page);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
    await expect.poll(() => c.reqs.length).toBe(2);
    await page.waitForTimeout(100);
    expect(c.reqs).toHaveLength(2);
    expect(c.reqs[1].map((e) => e.t).sort()).toEqual(['engage', 'error', 'event', 'outbound']);
  });

  test('requests per pageview <= 2 (load, track one event, leave)', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/index.html');
    await expect.poll(() => c.reqs.length).toBe(1);
    await page.evaluate(() => (window as any).trail.track('t1'));
    // real navigation is covered by bench/bench.mjs (counted server-side); routes miss unload beacons
    await hide(page);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
    await expect.poll(() => c.of('event').length).toBe(1);
    await page.waitForTimeout(100);
    expect(c.reqs.length).toBeLessThanOrEqual(2);
  });

  test('failed send retries with backoff and rc=1', async ({ page }) => {
    await page.clock.install();
    const c = await capture(page, [503]);
    await page.goto('/index.html');
    await expect.poll(() => c.reqs.length).toBe(1);
    expect(c.reqs[0][0].rc).toBeUndefined();
    await page.clock.runFor(500);
    await page.waitForTimeout(100);
    expect(c.reqs).toHaveLength(1);
    await page.clock.runFor(2500);
    await expect.poll(() => c.reqs.length).toBe(2);
    expect(c.reqs[1]).toMatchObject([{ t: 'pageview', rc: 1 }]);
    await page.clock.runFor(120000);
    await page.waitForTimeout(100);
    expect(c.reqs).toHaveLength(2);
  });

  test('full mode: unsent events persist and are resent with rc>=1 on next load', async ({ page }) => {
    await page.route('**/_t/e', (r) => r.abort());
    await page.goto('/index.html');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('_t_q'))).toContain('pageview');
    await page.unroute('**/_t/e');
    const c = await capture(page);
    await page.reload();
    await expect.poll(() => c.of('pageview').length).toBe(2);
    const old = c.of('pageview').find((e) => e.rc >= 1);
    expect(old?.u).toMatch(/index\.html$/);
    expect(c.of('pageview').filter((e) => !e.rc)).toHaveLength(1);
    expect(await page.evaluate(() => localStorage.getItem('_t_q'))).toBeNull();
  });

  test('full mode: resent _t_q events report their age', async ({ page }) => {
    await page.clock.install();
    await page.route('**/_t/e', (r) => r.abort());
    await page.goto('/index.html');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('_t_q'))).toContain('pageview');
    await page.unroute('**/_t/e');
    const c = await capture(page);
    await page.clock.fastForward('02:00:00');
    await page.reload();
    await expect.poll(() => c.of('pageview').length).toBe(2);
    expect(c.of('pageview').find((e) => e.rc >= 1)?.c).toBeGreaterThanOrEqual(7200000);
  });

  test('consent(false) queued before load stops the persisted-queue resend', async ({ page }) => {
    await page.route('**/_t/e', (r) => r.abort());
    await page.goto('/full.html');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('_t_q'))).toContain('pageview');
    await page.unroute('**/_t/e');
    const c = await capture(page);
    await page.addInitScript(() => ((window as any).trailq = [['consent', false]]));
    await page.reload();
    await page.waitForTimeout(300);
    expect(c.reqs).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem('_t_q'))).toBeNull();
  });

  test('deny then grant: a send that fails during the denial is never retried', async ({ page }) => {
    await page.clock.install();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const sent: Ev[] = [];
    let first = true;
    await page.route('**/_t/e', async (route) => {
      if (first) {
        first = false;
        await held;
        return route.abort();
      }
      sent.push(...[].concat(JSON.parse(route.request().postData() ?? 'null')));
      await route.fulfill({ status: 204 });
    });
    await page.goto('/full.html');
    await expect.poll(() => first).toBe(false); // pageview in flight
    await trail(page, 'consent', false);
    release();
    await page.waitForTimeout(200); // the failure lands while denied
    await trail(page, 'consent', true);
    await trail(page, 'track', 'after');
    await page.clock.runFor(60000);
    await hide(page);
    await expect.poll(() => sent.filter((e) => e.n === 'after').length).toBe(1);
    expect(sent.filter((e) => e.t === 'pageview')).toEqual([]);
  });

  test('no batch is larger than 50 events', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/index.html');
    await expect.poll(() => c.reqs.length).toBe(1);
    await page.evaluate(() => { for (let i = 0; i < 80; i++) (window as any).trail.track('e' + i); });
    await hide(page);
    await expect.poll(() => c.of('event').length).toBeGreaterThanOrEqual(50);
    await page.waitForTimeout(200);
    expect(c.reqs.every((r) => r.length <= 50)).toBe(true);
  });
});

test.describe('opt-in vitals and rage clicks (t.x.js)', () => {
  test('rage click: 3 fast clicks -> rage_click event', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/extras.html');
    await page.click('#b', { clickCount: 3, delay: 20 });
    await hide(page);
    await expect.poll(() => c.of('event').filter((e) => e.n === 'rage_click').length).toBe(1);
  });

  test('vitals reported on hide only when data-vitals', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/extras.html'); // waits for load, which waits for the injected t.x.js
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await page.waitForTimeout(300); // let PerformanceObserver deliver the LCP entry
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

  test('no extras file is requested without data-vitals/-rage/-forms/-errors', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    const c = await capture(page);
    await page.goto('/full.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await page.waitForTimeout(200);
    expect(urls.filter((u) => u.includes('t.x.js'))).toHaveLength(0);
  });

  test('extras file is loaded from next to t.js when asked for', async ({ page }) => {
    const req = page.waitForRequest('**/_t/t.x.js');
    await page.goto('/extras.html');
    await req;
  });
});

// Records every storage write (setItem/removeItem, document.cookie sets) in __w and every getItem in __r.
const spy = () => {
  const w = window as any;
  w.__w = [];
  w.__r = []; // reads (getItem) go here, apart from writes
  for (const k of ['getItem', 'setItem', 'removeItem'] as const) {
    const f = Storage.prototype[k];
    Storage.prototype[k] = function (this: Storage, ...a: any[]) {
      (k == 'getItem' ? w.__r : w.__w).push(`${this === localStorage ? 'ls' : 'ss'}.${k}:${a[0]}`);
      return (f as any).apply(this, a);
    };
  }
  const c = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => c.get!.call(document),
    set: (v) => (w.__w.push('cookie:' + v), c.set!.call(document, v)),
  });
};
const writes = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).__w);
const reads = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).__r);
const trail = (page: Page, m: string, ...a: any[]) => page.evaluate(([m, a]) => (window as any).trail[m](...a), [m, a] as const);

test.describe('modes and consent', () => {
  test.beforeEach(({ page }) => page.addInitScript(spy));

  test('default: no storage writes, events have m:"p" and a:""', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/default.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await trail(page, 'track', 'x');
    await hide(page);
    await expect.poll(() => c.of('event').length).toBe(1);
    expect(c.events.every((e) => e.m === 'p' && e.a === '' && e.ss === '')).toBe(true);
    expect(await writes(page)).toEqual([]);
  });

  test('default: consent(true) -> storage written, next events m:"f" with a uuid a; reload keeps full', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/default.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await trail(page, 'consent', true);
    expect(await writes(page)).toEqual(expect.arrayContaining(['ls.setItem:_t_c', 'ls.setItem:_t_id']));
    expect(await page.evaluate(() => document.cookie)).toMatch(/_t_id=/);
    await trail(page, 'track', 'x');
    await hide(page);
    await expect.poll(() => c.of('event').length).toBe(1);
    expect(c.of('event')[0]).toMatchObject({ m: 'f', a: expect.stringMatching(/^[0-9a-f]{14,41}$/) });
    await page.reload();
    await expect.poll(() => c.of('pageview').length).toBe(2);
    expect(c.of('pageview')[1]).toMatchObject({ m: 'f', a: c.of('event')[0].a });
  });

  test('consent(true) keeps events already queued', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/default.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await trail(page, 'track', 'before');
    await trail(page, 'consent', true);
    await hide(page);
    await expect.poll(() => c.of('event').length).toBe(1);
    expect(c.of('event')[0]).toMatchObject({ n: 'before', m: 'p', a: '' });
  });

  test('default: identify("u1") upgrades like consent(true)', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/default.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await trail(page, 'identify', 'u1');
    await hide(page);
    await expect.poll(() => c.of('identify').length).toBe(1);
    expect(c.of('identify')[0]).toMatchObject({ m: 'f', uid: 'u1', a: expect.stringMatching(/^[0-9a-f]{14,41}$/) });
    expect(await page.evaluate(() => localStorage.getItem('_t_c'))).toBe('1');
  });

  test('consent(false) after true -> state wiped, _t_c="0", nothing sent, reload sends nothing', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/default.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await trail(page, 'consent', true);
    await trail(page, 'identify', 'u1');
    await trail(page, 'track', 'queued-before-denial');
    await trail(page, 'consent', false);
    const st = await page.evaluate(() => ({ c: document.cookie, ls: { ...localStorage }, ss: { ...sessionStorage } }));
    expect(st.c).not.toMatch(/_t_id=/);
    expect(st.ls).toEqual({ _t_c: '0' });
    expect(st.ss).toEqual({});
    const n = c.reqs.length;
    await trail(page, 'track', 'after');
    await trail(page, 'pageview');
    await hide(page);
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
    await page.waitForTimeout(200);
    expect(c.reqs).toHaveLength(n);
    await page.reload();
    await page.waitForTimeout(300);
    expect(c.reqs).toHaveLength(n);
  });

  test('consent(false) while a send is failing: no retry goes out afterwards', async ({ page }) => {
    await page.clock.install();
    const c = await capture(page, [503]);
    await page.goto('/full.html');
    await expect.poll(() => c.reqs.length).toBe(1);
    await page.waitForTimeout(100); // the 503 lands, a retry is armed
    await trail(page, 'consent', false);
    await page.clock.runFor(60000);
    await page.waitForTimeout(200);
    expect(c.reqs).toHaveLength(1);
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/_t_id=/);
  });

  test('consent(true) after a denial resumes and clears the denial', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/default.html');
    await trail(page, 'consent', false);
    await page.reload();
    await trail(page, 'consent', true);
    expect(await page.evaluate(() => localStorage.getItem('_t_c'))).toBe('1');
    await trail(page, 'track', 'back');
    await hide(page);
    await expect.poll(() => c.of('event').length).toBe(1);
    expect(c.of('event')[0].m).toBe('f');
  });

  test('data-mode=full: storage from first pageview, m:"f"', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/full.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    expect(c.of('pageview')[0]).toMatchObject({ m: 'f', a: expect.stringMatching(/^[0-9a-f]{14,41}$/) });
    expect(await writes(page)).toEqual(expect.arrayContaining([expect.stringMatching(/^cookie:_t_id=/), 'ls.setItem:_t_id', 'ls.setItem:_t_s']));
  });

  test('data-mode=private: consent(true) and identify do not upgrade, no storage ever', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/private.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await trail(page, 'consent', true);
    await trail(page, 'identify', 'u1');
    await trail(page, 'track', 'x');
    await hide(page);
    await expect.poll(() => c.of('event').length).toBe(1);
    expect(c.events.every((e) => e.m === 'p' && e.a === '')).toBe(true);
    expect(c.of('identify')).toHaveLength(0); // the server rejects identify in private mode
    expect(await writes(page)).toEqual([]);
  });

  test('data-mode=private: no storage reads or writes, even after consent(false)', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/private.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await trail(page, 'consent', false);
    await trail(page, 'track', 'x');
    await hide(page);
    await page.waitForTimeout(100);
    expect(c.of('event')).toHaveLength(0);
    expect(await writes(page)).toEqual([]);
    expect(await reads(page)).toEqual([]);
  });

  for (const [name, init] of [
    ['DNT=1', () => Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' })],
    ['GPC', () => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true })],
  ] as const)
    test(`${name} -> zero requests, no storage`, async ({ page }) => {
      await page.addInitScript(init);
      const c = await capture(page);
      await page.goto('/full.html');
      await page.waitForTimeout(300);
      await hide(page);
      await page.waitForTimeout(100);
      expect(c.reqs).toHaveLength(0);
      expect(await writes(page)).toEqual([]);
    });

  test('data-dnt=off with DNT=1 -> requests flow', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' }));
    const c = await capture(page);
    await page.goto('/dnt.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
  });

  test('named click: click inside [data-trail] -> event n=<name>; not in private mode', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/full.html');
    await page.click('#named');
    await hide(page);
    await expect.poll(() => c.of('event').length).toBe(1);
    expect(c.of('event')[0]).toMatchObject({ n: 'Signup', m: 'f' });

    const p = await capture(page);
    await page.goto('/default.html');
    await expect.poll(() => p.of('pageview').length).toBe(1);
    await page.click('#named');
    await hide(page);
    await page.waitForTimeout(200);
    expect(p.of('event')).toHaveLength(0);
  });

  test('t.p.js: no storage, no upgrade; pageview, engage, outbound, error still work', async ({ page }) => {
    await page.clock.install();
    const c = await capture(page);
    await page.goto('/p.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await trail(page, 'consent', true);
    await trail(page, 'identify', 'u1');
    await page.click('#out');
    await page.click('#named');
    await page.addScriptTag({ content: 'throw new Error("p1")' });
    await page.clock.runFor(500);
    await hide(page);
    await expect.poll(() => c.reqs.length).toBe(2);
    expect(c.reqs[1].map((e) => e.t).sort()).toEqual(['engage', 'error', 'outbound']);
    expect(c.events.every((e) => e.m === 'p' && e.a === '')).toBe(true);
    expect(await writes(page)).toEqual([]);
  });
});

test('prerender: no pageview until activation, then exactly one', async ({ page }) => {
  const c = await capture(page);
  await page.goto('/prerender.html');
  await page.waitForTimeout(300);
  expect(c.of('pageview')).toHaveLength(0);
  await page.evaluate(() => {
    (window as any).__pr = false;
    document.dispatchEvent(new Event('prerenderingchange'));
  });
  await expect.poll(() => c.of('pageview').length).toBe(1);
  await page.waitForTimeout(200);
  expect(c.of('pageview')).toHaveLength(1);
  expect(c.of('pageview')[0].rt).toBeUndefined();
  expect(c.of('pageview')[0].r).toBe(await page.evaluate(() => document.referrer));
});

test.describe('data-hash (t.x.js)', () => {
  test('hashchange and pushState hash navigations are pageviews', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/hash.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await page.evaluate(() => (location.hash = '#/a'));
    await expect.poll(() => c.of('pageview').length).toBe(2);
    await page.evaluate(() => history.pushState(null, '', '#/b'));
    await expect.poll(() => c.of('pageview').length).toBe(3);
    await page.waitForTimeout(200);
    expect(c.of('pageview')).toHaveLength(3);
    expect(c.of('pageview')[2].u).toMatch(/#\/b$/);
  });

  test('in-page anchors are not pageviews', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/hash.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await page.evaluate(() => (location.hash = '#section'));
    await page.waitForTimeout(300);
    expect(c.of('pageview')).toHaveLength(1);
  });

  test('without data-hash, hash routes are not pageviews', async ({ page }) => {
    const c = await capture(page);
    await page.goto('/full.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await page.evaluate(() => (location.hash = '#/a'));
    await page.waitForTimeout(300);
    expect(c.of('pageview')).toHaveLength(1);
  });
});

test.describe('visit token', () => {
  test('private: pageview response x-trail-k is echoed as k on later events', async ({ page }) => {
    const c = await capture(page, [], { 'x-trail-k': 'TOK', 'access-control-expose-headers': 'x-trail-k' });
    await page.goto('/private.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    expect(c.of('pageview')[0]).not.toHaveProperty('k'); // no k before a token arrives
    await expect.poll(() => page.evaluate(() => 1)).toBe(1);
    await page.waitForTimeout(200);
    await page.evaluate(() => (window as any).trail.track('x'));
    await hide(page);
    await expect.poll(() => c.of('event').length).toBe(1);
    expect(c.of('event')[0].k).toBe('TOK');
    expect(c.of('engage').every((e) => e.k === 'TOK')).toBe(true);
  });

  test('k from a late pageview response is still echoed', async ({ page }) => {
    const c = await capture(page, [], { 'x-trail-k': 'LATE' }, 500);
    await page.goto('/private.html');
    await expect.poll(() => c.of('pageview').length).toBe(1);
    await page.evaluate(() => history.pushState({}, '', '/index.html?p=2')); // before the response arrives
    await page.waitForTimeout(900);
    await page.evaluate(() => (window as any).trail.track('later'));
    await hide(page);
    await expect.poll(() => c.of('event').length).toBe(1);
    expect(c.of('event')[0].k).toBe('LATE');
  });
});
