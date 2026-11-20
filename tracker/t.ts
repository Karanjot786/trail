// Trail tracker. Built with esbuild (build.mjs); budget: 2048 bytes gzipped per file.
// MODE (esbuild define) is 'full' for t.js and 'private' for t.p.js; every storage path sits
// behind `MODE == 'full' ?`/`&&`, so t.p.js compiles with no storage code at all.
//   t.js modes: no data-mode = private until consent(true)/identify(); data-mode="full"
//   stores from the start; data-mode="private" never upgrades.
// Private mode never touches storage: a and ss go out empty and the server derives them.
// Vitals and rage clicks are in x.ts (t.x.js), loaded only when asked for.
declare const MODE: string;

((w: any, d: Document, l: Location, h: History, n: any) => {
  const s = d.currentScript as HTMLScriptElement | null;
  if (w.__trail || !s) return; // double-load guard
  const D = s.dataset;
  const site = D.site;
  const api = D.api || '/_t/e';
  // skip: no site, prerender, localhost unless data-dev, Do Not Track / GPC unless data-dnt="off"
  if (
    !site ||
    (d as any).prerendering ||
    (D.dev == null && /^(localhost|127\.|\[::1\])/.test(l.hostname)) ||
    (D.dnt != 'off' && (n.doNotTrack == '1' || n.globalPrivacyControl))
  )
    return;

  const ls: (k: string, v?: string | null) => any =
    MODE == 'full'
      ? (k, v) => {
          try {
            return (localStorage as any)[v === undefined ? 'getItem' : v ? 'setItem' : 'removeItem'](k, v); // v null: remove
          } catch {}
        }
      : (0 as any);
  // time-ordered uuid (v7 layout): 48-bit ms time, then 72 random bits
  const uuid: () => string =
    MODE == 'full'
      ? () =>
          (Date.now().toString(16).padStart(12, '0') + [...crypto.getRandomValues(new Uint8Array(9))].map((b) => (b | 256).toString(16).slice(1)).join('')).replace(
            /(.{8})(.{4})(.{3})(.{3})/,
            '$1-$2-7$3-8$4-',
          )
      : (0 as any);

  // consent: _t_c "1" = granted (upgraded), "0" = denied (send nothing, store nothing else)
  const c0 = MODE == 'full' && ls('_t_c');
  let stop = c0 === '0'; // ===: in t.p.js c0 is false, and false == '0'
  let full: any = MODE == 'full' && !stop && (D.mode == 'full' || (D.mode != 'private' && c0 == '1'));

  // identity (full mode only): cookie wins over localStorage; both are (re)written
  let a = '', U: string | undefined, S: any = {};
  const setA: (v: string) => void =
    MODE == 'full'
      ? (v) => {
          a = v;
          d.cookie = `_t_id=${v};Max-Age=31536000;Path=/;SameSite=Lax`;
          ls('_t_id', v);
        }
      : (0 as any);
  const up: () => void =
    MODE == 'full'
      ? () => {
          full = 1;
          setA(d.cookie.match(/(^|; )_t_id=([^;]+)/)?.[2] || ls('_t_id') || uuid());
          U = ls('_t_u') || U;
          try {
            S = JSON.parse(ls('_t_s') || '{}');
          } catch {}
        }
      : (0 as any);
  if (MODE == 'full' && full) up();

  // session {id,last,start,src}: 30 min idle, 24 h cap, new utm/external referrer
  const sess = (src: string) => {
    if (MODE != 'full' || !full) return '';
    const t = Date.now();
    if (!S.id || t - S.last > 18e5 || t - S.start > 864e5 || (src && src != S.src)) S = { id: uuid(), start: t, src };
    S.last = t;
    ls('_t_s', JSON.stringify(S));
    return S.id;
  };

  // delivery: pageview posts at once; everything else waits in q for the leave beacon.
  // Failed events (F, rc counts resends) retry with backoff; in full mode they are also
  // mirrored in localStorage._t_q and resent on the next page load.
  let route: string | undefined;
  let q: any[] = [], F: any[] = [], tries = 0, rtm: any;
  const save = () => MODE == 'full' && full && ls('_t_q', F.length ? JSON.stringify(F.slice(-50)) : null);
  const fail = (evs: any[]) => {
    for (const e of evs) e.rc = -~e.rc;
    F.push(...evs);
    save();
    if (tries < 5 && !rtm) rtm = setTimeout(() => ((rtm = 0), post(F.splice(0, 50)), tries++), 2 ** tries * 1e3); // 1, 2, 4, 8, 16 s
  };
  // a string body is sent as text/plain, so no preflight
  // stop: after consent(false) nothing goes out, not even a retry armed before it
  const post = (evs: any[]) =>
    stop ||
    fetch(api, { method: 'POST', keepalive: true, body: JSON.stringify(evs) })
      .then((r) => {
        if (/^5|408|429/.test(r.status as any)) throw 0;
        save(); // keeps _t_q in step with F (full mode)
      })
      .catch(() => fail(evs));
  const flush = () => {
    if (q.length && !n.sendBeacon(api, JSON.stringify(q))) fail(q);
    q = [];
  };
  const send = (t: string, x: any = {}, src = '') => {
    if (stop) return;
    const ev = { s: site, t, a, ss: sess(src), uid: U, u: l.href, rt: route, env: D.env, w: +!!n.webdriver, m: full ? 'f' : 'p', ...x };
    if (t == 'pageview') post([ev]);
    else if (q.push(ev) > 49) post(q), (q = []);
  };
  const old = MODE == 'full' && full && ls('_t_q');
  if (old) {
    ls('_t_q', null);
    try {
      post(JSON.parse(old));
    } catch {}
  }

  // per-page state
  let started = 0, pu = l.href, last = l.pathname + l.search;
  let acc = 0, t0 = 0, tm: any, ten = 0, fl = 0, sc = 0;
  const vis = () => d.visibilityState == 'visible';
  const cur = () => acc + (t0 ? Date.now() - t0 : 0);
  const scroll = () => (sc = Math.max(sc, Math.min(100, Math.round(((w.scrollY + w.innerHeight) / d.documentElement.scrollHeight) * 100) || 0)));
  const eng = () => {
    scroll();
    const e = cur();
    if (e > 0 && e != fl) send('engage', { e: (fl = e), sc, u: pu });
  };
  const arm = () => {
    if (!ten) tm = setTimeout(() => ((ten = 1), eng()), 1e4 - acc);
  };

  const page = (rt?: string) => {
    started && eng();
    const ref = started ? pu : d.referrer;
    let src = new URLSearchParams(l.search).get('utm_source') || '';
    try {
      const rh = new URL(ref).hostname;
      if (!started && !src && rh != l.hostname) src = rh;
    } catch {}
    started = 1;
    route = rt || D.route;
    acc = ten = fl = sc = 0;
    t0 = vis() ? Date.now() : 0;
    clearTimeout(tm);
    t0 && arm();
    pu = l.href;
    send('pageview', { r: ref }, src);
  };
  const nav = () => {
    const k = l.pathname + l.search;
    if (k != last) (last = k), page();
  };

  // leaving (pagehide and/or hidden, in any order) sends one engage until visible again
  let left = 0;
  const leave = () => {
    if (!left) (left = 1), (acc = cur()), (t0 = 0), clearTimeout(tm), eng();
    flush();
  };
  const hide = () => (vis() ? ((left = 0), (t0 = Date.now()), arm()) : leave());

  const rot = MODE == 'full' ? () => (setA(uuid()), (S = {})) : (0 as any);
  // upgrade to full mode: t.js default mode only, never over a denial
  const grant = () => MODE == 'full' && !full && !stop && D.mode != 'private' && (ls('_t_c', '1'), up());
  // t.p.js: identify/reset do nothing, consent(false) stops this page only (it stores nothing)
  const api_: any = {
    track: (name: string, p?: any) => send('event', { n: name, d: p }),
    pageview: (o?: { route?: string }) => page(o && o.route),
    identify: (id: string) => {
      grant();
      if (MODE != 'full' || !full) return; // private mode: the server takes no identify
      if (U && U != id) rot();
      ls('_t_u', (U = '' + id)); // string, or the server rejects the batch
      send('identify');
    },
    reset: () => MODE == 'full' && full && (rot(), (U = undefined), ls('_t_u', null)),
    consent: (g: boolean) => {
      stop = !g;
      if (g) grant();
      else if (((q = F = []), MODE == 'full')) {
        // denial: drop the queue, wipe everything, keep only _t_c = "0"
        full = a = '';
        U = undefined;
        d.cookie = '_t_id=;Max-Age=0;Path=/';
        for (const k of ['_t_id', '_t_s', '_t_u', '_t_q']) ls(k, null);
        ls('_t_c', '0');
      }
    },
  };

  w.__trail = send; // also the double-load guard; t.x.js reports through it

  // queue stub: calls made before load wait in window.trailq as [method, ...args]
  w.trail = api_;
  (w.trailq || []).forEach((c: any) => api_[c[0]]?.(c[1], c[2]));

  d.addEventListener('visibilitychange', hide); // document, not window: Safari doesn't bubble it to window
  addEventListener('pagehide', leave);
  addEventListener('scroll', scroll); // scroll events can't be cancelled, so no passive flag needed
  addEventListener('popstate', nav);
  for (const k of ['pushState', 'replaceState'] as const) {
    const o = h[k];
    h[k] = function () {
      o.apply(this, arguments as any);
      nav();
    };
  }

  d.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element).closest?.('a') as HTMLAnchorElement | null;
      if (el && /^https?:$/.test(el.protocol) && el.host != l.host) send('outbound', { d: { url: el.href } });
      // named clicks: <button data-trail="Signup"> (full mode only)
      if (MODE == 'full' && full) {
        const t = (e.target as Element).closest?.('[data-trail]') as HTMLElement | null;
        t && send('event', { n: t.dataset.trail });
      }
    },
    true,
  );
  // opt-in extras live in t.x.js, next to this file; it reads data-vitals/-rage/-forms/-errors off this tag
  if (/ data-(vitals|rage|forms|errors)\b/.test(s.outerHTML)) {
    const x = d.createElement('script');
    x.src = s.src.replace(/[^/]*$/, 't.x.js');
    d.head.append(x);
  }

  page();
})(window, document, location, history, navigator);
