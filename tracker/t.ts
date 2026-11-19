// Trail tracker. Built with esbuild (build.mjs); budget: 2048 bytes gzipped.
// FULL is an esbuild define: true compiles in the opt-in vitals + rage-click code.
declare const FULL: boolean;

((w: any, d: Document, l: Location, h: History, n: Navigator) => {
  const s = d.currentScript as HTMLScriptElement | null;
  if (w.__trail || !s) return; // double-load guard
  w.__trail = 1;
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

  let route: string | undefined;
  const send = (t: string, x: any = {}, src = '') => {
    const body = JSON.stringify({ s: site, t, a, ss: sess(src), uid: U, u: l.href, rt: route, env: D.env, w: +!!n.webdriver, ...x });
    fetch(api, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body }).catch(() => n.sendBeacon(api, body));
  };

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

  const hide = () => {
    if (vis()) {
      t0 = Date.now();
      arm();
    } else {
      acc = cur();
      t0 = 0;
      clearTimeout(tm);
      eng();
    }
  };

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

  // queue stub: window.trail was a function collecting into window.trailq
  const q = typeof w.trail == 'function' ? w.trailq || [] : [];
  w.trail = api_;
  q.forEach((c: any) => (api_ as any)[c[0]]?.(c[1], c[2]));

  addEventListener('visibilitychange', hide);
  addEventListener('pagehide', eng);
  addEventListener('scroll', scroll, { passive: true });
  addEventListener('popstate', nav);
  const ps = h.pushState;
  h.pushState = function () {
    ps.apply(this, arguments as any);
    nav();
  };

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

  if (FULL) {
    if (D.vitals != null) {
      const m: any = { LCP: 0, CLS: 0, INP: 0 };
      const ob = (type: string, cb: (e: any) => void, o?: any) => {
        try {
          new PerformanceObserver((li) => li.getEntries().forEach(cb)).observe({ type, buffered: true, ...o });
        } catch {}
      };
      ob('largest-contentful-paint', (e) => (m.LCP = e.startTime));
      ob('layout-shift', (e) => e.hadRecentInput || (m.CLS += e.value));
      ob('event', (e) => e.interactionId && e.duration > m.INP && (m.INP = e.duration), { durationThreshold: 40 });
      let done = 0;
      addEventListener('visibilitychange', () => {
        if (!vis() && !done) {
          done = 1;
          for (const k in m) m[k] && send('vital', { n: k, d: { value: +m[k].toFixed(3) } });
        }
      });
    }
    if (D.rage != null) {
      let c: number[][] = [];
      d.addEventListener(
        'click',
        (e) => {
          const t = Date.now();
          c = c.filter((p) => t - p[0] < 1e3 && Math.abs(p[1] - e.clientX) < 30 && Math.abs(p[2] - e.clientY) < 30);
          c.push([t, e.clientX, e.clientY]);
          if (c.length > 2) (c = []), send('event', { n: 'rage_click' });
        },
        true,
      );
    }
  }

  page();
})(window, document, location, history, navigator);
