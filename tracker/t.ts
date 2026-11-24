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
  // skip: no site, localhost unless data-dev, Do Not Track / GPC unless data-dnt="off"
  if (
    !site ||
    (D.dev == null && /^(localhost|127\.|\[::1\])/.test(l.hostname)) ||
    (D.dnt != 'off' && (n.doNotTrack == '1' || n.globalPrivacyControl))
  )
    return;

  const ls: (k: string, v?: string) => any =
    MODE == 'full'
      ? (k, v) => {
          try {
            return (localStorage as any)[v == null ? 'getItem' : v ? 'setItem' : 'removeItem'](k, v); // v '': remove
          } catch {}
        }
      : (0 as any);
  // time-ordered id: ms time in hex, then 96 random bits as decimal digits
  const uuid: () => string =
    MODE == 'full'
      ? () => Date.now().toString(16) + crypto.getRandomValues(new Uint32Array(3)).join('')
      : (0 as any);

  // consent: _t_c "1" = granted (upgraded), "0" = denied (send nothing, store nothing else)
  // data-mode="private" on t.js: never read or write storage, same as t.p.js
  const st = MODE == 'full' && D.mode != 'private';
  const c0 = st && ls('_t_c');
  let stop = c0 === '0'; // ===: c0 can be false, and false == '0'
  let full: any = st && !stop && (D.mode == 'full' || c0 == '1');

  // identity (full mode only): cookie wins over localStorage; both are (re)written
  let a = '', U: string | undefined, S: any = {};
  const setA: (v: string) => void =
    MODE == 'full'
      ? (v) => {
          a = v;
          d.cookie = `_t_id=${v};Max-Age=${v ? 31536000 : 0};Path=/;SameSite=Lax`; // '' deletes
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
  let q: any[] = [], F: any[] = [], tries = 0, rtm: any, K: any;
  const save = () => MODE == 'full' && full && ls('_t_q', F.length ? JSON.stringify(F.slice(-50)) : '');
  const fail = (evs: any[]) => {
    for (const e of evs) e.rc = -~e.rc;
    F.push(...evs);
    save();
    if (tries < 5 && !rtm) rtm = setTimeout(() => ((rtm = 0), post(F.splice(0, 50)), tries++), 2 ** tries * 1e3); // 1, 2, 4, 8, 16 s
  };
  // c is the event's creation time in memory and in _t_q; on the wire it is the age in ms.
  // Not a JSON.stringify replacer: that would also rewrite a user prop named c inside d.
  const J = (e: any[]) => JSON.stringify(e.map((v: any) => ({ ...v, c: Date.now() - v.c })));
  // a string body is sent as text/plain, so no preflight
  // stop: after consent(false) nothing goes out, not even a retry armed before it
  const post = (evs: any[]) =>
    stop ||
    fetch(api, { method: 'POST', keepalive: true, body: J(evs) })
      .then((r) => {
        if (/^5|408|429/.test(r.status as any)) throw 0;
        K = r.headers.get('x-trail-k') || K;
        save(); // keeps _t_q in step with F (full mode)
      })
      .catch(() => stop || fail(evs)); // a failure landing after a denial is dropped
  const flush = () => {
    if (q.length && !n.sendBeacon(api, J(q))) fail(q);
    q = [];
  };
  const send = (t: string, x: any = {}, src = '') => {
    if (stop) return;
    const ev = { c: Date.now(), s: site, t, a, ss: sess(src), uid: U, u: l.href, rt: route, env: D.env, w: +!!n.webdriver, m: full ? 'f' : 'p', k: K, ...x };
    if (t == 'pageview') post([ev]);
    else if (q.push(ev) > 49) post(q), (q = []);
  };

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

  const rot = MODE == 'full' ? () => (setA(uuid()), (S = {}), (U = undefined), ls('_t_u', '')) : (0 as any);
  // upgrade to full mode: t.js default mode only, never over a denial
  const grant = () => MODE == 'full' && st && !full && !stop && (ls('_t_c', '1'), up());
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
    reset: () => MODE == 'full' && full && rot(),
    consent: (g: boolean) => {
      stop = !g;
      if (g) grant();
      else if (((q = F = []), (rtm = clearTimeout(rtm)), MODE == 'full' && st)) {
        // denial: drop the queue and any armed retry, wipe everything, keep only _t_c = "0";
        // data-mode="private" (st false) stops this page only and touches no storage
        full = a = '';
        U = undefined;
        setA('');
        for (const k of ['_t_id', '_t_s', '_t_u', '_t_q']) ls(k, '');
        ls('_t_c', '0');
      }
    },
  };

  w.__trail = send; // also the double-load guard; t.x.js reports through it

  // queue stub: calls made before load wait in window.trailq as [method, ...args]
  w.trail = api_;
  (w.trailq || []).map((c: any) => api_[c.shift()]?.(...c));
  // resend last page's failed events, after the queue so a queued consent(false) wins
  if (MODE == 'full' && full)
    try {
      post([...JSON.parse(ls('_t_q'))]); // throws (null is not iterable) when there is none
      ls('_t_q', '');
    } catch {}

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
  if (/ data-(vitals|rage|forms|errors|hash)/.test(s.outerHTML)) {
    const x = d.createElement('script');
    x.src = s.src.replace(/[^/]*$/, 't.x.js');
    d.head.append(x);
  }

  (d as any).prerendering ? ((d as any).onprerenderingchange = () => page()) : page(); // arrow: page(event) would store the Event as route
})(window, document, location, history, navigator);
