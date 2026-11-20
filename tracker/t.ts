// Trail tracker. Built with esbuild (build.mjs); budget: 2048 bytes gzipped per file.
// Vitals and rage clicks are in x.ts (t.x.js), loaded only when asked for.

((w: any, d: Document, l: Location, h: History, n: Navigator) => {
  const s = d.currentScript as HTMLScriptElement | null;
  if (w.__trail || !s) return; // double-load guard
  const D = s.dataset;
  const site = D.site;
  const api = D.api || '/_t/e';
  // skip: no site, prerender, localhost unless data-dev
  if (!site || d.prerendering || (D.dev == null && /^(localhost|127\.|\[::1\])/.test(l.hostname))) return;

  const ls = (k: string, v?: string | null): any => {
    try {
      return v === undefined ? localStorage.getItem(k) : v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
    } catch {}
  };
  const uuid = () => {
    const r = crypto.getRandomValues(new Uint8Array(10));
    const x = [...r].map((b) => (b + 256).toString(16).slice(1)).join('');
    const t = Date.now().toString(16).padStart(12, '0');
    return `${t.slice(0, 8)}-${t.slice(8)}-7${x.slice(0, 3)}-${'89ab'[r[0] & 3]}${x.slice(3, 6)}-${x.slice(6, 18)}`;
  };

  // identity: cookie wins over localStorage; both are (re)written
  let a: string;
  const setA = (v: string) => {
    a = v;
    d.cookie = `_t_id=${v};Max-Age=31536000;Path=/;SameSite=Lax`;
    ls('_t_id', v);
  };
  setA((d.cookie.match(/(?:^|; )_t_id=([^;]+)/) || [])[1] || ls('_t_id') || uuid());
  let U: string | undefined = ls('_t_u') || undefined;

  // session {id,last,start,src}: 30 min idle, 24 h cap, new utm/external referrer
  let S: any = {};
  try {
    S = JSON.parse(ls('_t_s') || '{}');
  } catch {}
  const sess = (src: string) => {
    const t = Date.now();
    if (!S.id || t - S.last > 18e5 || t - S.start > 864e5 || (src && src != S.src)) S = { id: uuid(), start: t, src };
    S.last = t;
    ls('_t_s', JSON.stringify(S));
    return S.id;
  };

  // delivery: pageview posts at once; everything else waits in q for the leave beacon.
  // Failed events (F, with rc counting resends) retry with backoff and, mirrored in
  // localStorage._t_q, are resent on the next page load.
  let route: string | undefined;
  let q: any[] = [], F: any[] = [], tries = 0, rtm: any;
  const save = () => ls('_t_q', F.length ? JSON.stringify(F.slice(-50)) : null);
  const fail = (evs: any[]) => {
    for (const e of evs) e.rc = -~e.rc;
    F.push(...evs);
    save();
    if (tries < 5 && !rtm) rtm = setTimeout(() => ((rtm = 0), post(F.splice(0, 50), ++tries)), Math.min(2 ** tries, 60) * 1e3);
  };
  const post = (evs: any[], retry?: number) =>
    fetch(api, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(evs) })
      .then((r) => {
        if (r.status > 499 || r.status == 408 || r.status == 429) throw 0;
        retry && save();
      })
      .catch(() => fail(evs));
  const flush = () => {
    if (q.length && !n.sendBeacon(api, JSON.stringify(q))) fail(q);
    q = [];
  };
  const send = (t: string, x: any = {}, src = '') => {
    const ev = { s: site, t, a, ss: sess(src), uid: U, u: l.href, rt: route, env: D.env, w: +!!n.webdriver, ...x };
    if (t == 'pageview') post([ev]);
    else if (q.push(ev) > 49) post(q), (q = []);
  };
  const old = ls('_t_q');
  if (old) {
    ls('_t_q', null);
    try {
      post(JSON.parse(old));
    } catch {}
  }

  // per-page state
  let started = 0, pu = l.href, last = l.pathname + l.search;
  let acc = 0, t0 = 0, tm: any, ten = 0, fl = 0, sc = 0, errs = 0, seen: any = {};
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
      if (!started && !src && new URL(ref).hostname != l.hostname) src = new URL(ref).hostname;
    } catch {}
    started = 1;
    route = rt || D.route;
    acc = ten = fl = sc = errs = 0;
    seen = {};
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

  const rot = () => (setA(uuid()), (S = {}));
  const api_ = {
    track: (name: string, p?: any) => send('event', { n: name, d: p }),
    identify: (id: string) => {
      if (U && U != id) rot();
      ls('_t_u', (U = id));
      send('identify');
    },
    reset: () => (rot(), (U = undefined), ls('_t_u', null)),
    pageview: (o?: { route?: string }) => page(o && o.route),
  };

  w.__trail = send; // also the double-load guard; t.x.js reports through it

  // queue stub: window.trail was a function collecting into window.trailq
  const tq = typeof w.trail == 'function' ? w.trailq || [] : [];
  w.trail = api_;
  tq.forEach((c: any) => (api_ as any)[c[0]]?.(c[1], c[2]));

  d.addEventListener('visibilitychange', hide); // document, not window: Safari doesn't bubble it to window
  addEventListener('pagehide', leave);
  addEventListener('scroll', scroll, { passive: true });
  addEventListener('popstate', nav);
  for (const k of ['pushState', 'replaceState'] as const) {
    const o = h[k];
    h[k] = function () {
      o.apply(this, arguments as any);
      nav();
    };
  }

  const err = (m: string) => {
    if (errs < 5 && !seen[m]) (seen[m] = 1), errs++, send('error', { d: { message: m.slice(0, 200) } });
  };
  addEventListener('error', (e) => err(e.message));
  addEventListener('unhandledrejection', (e) => err('' + (e.reason?.message || e.reason)));

  d.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element).closest?.('a') as HTMLAnchorElement | null;
      if (el && /^https?:$/.test(el.protocol) && el.host != l.host) send('outbound', { d: { url: el.href } });
    },
    true,
  );
  d.addEventListener(
    'submit',
    (e) => send('form', { n: (e.target as HTMLFormElement).id || (e.target as HTMLFormElement).name }),
    true,
  );

  // opt-in extras live in t.x.js, next to this file
  if (D.vitals != null || D.rage != null) {
    const x = d.createElement('script');
    x.async = true;
    x.src = s.src.replace(/[^/]*$/, 't.x.js');
    if (D.vitals != null) x.dataset.vitals = '';
    if (D.rage != null) x.dataset.rage = '';
    d.head.append(x);
  }

  page();
})(window, document, location, history, navigator);
