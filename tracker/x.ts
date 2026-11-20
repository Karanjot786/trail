// Trail opt-in extras, loaded by t.js / t.p.js only when data-vitals, -rage, -forms or -errors is set.
// Reports through the core's window.__trail(type, extra); does nothing without it.
((w: any, d: Document) => {
  const D = (d.querySelector('script[data-site]') as HTMLScriptElement).dataset; // the core's tag
  const send = w.__trail;
  if (typeof send != 'function') return;
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
    d.addEventListener('visibilitychange', () => {
      if (d.visibilityState != 'visible' && !done) {
        done = 1;
        for (const k in m) m[k] && send('vital', { n: k, d: { value: +m[k].toFixed(3) } });
      }
    }, true); // capture: runs before the core's listener, so vitals join its leave batch
  }
  if (D.errors != null) {
    // ponytail: max 5 distinct errors per page load (not per SPA page); errors before this file loads are missed
    let c = 0;
    const seen: any = {};
    const err = (m: string) => c < 5 && !seen[m] && ((seen[m] = 1), c++, send('error', { d: { message: m.slice(0, 200) } }));
    addEventListener('error', (e) => err(e.message));
    addEventListener('unhandledrejection', (e) => err('' + (e.reason?.message || e.reason)));
  }
  if (D.forms != null)
    d.addEventListener('submit', (e: any) => send('form', { n: e.target.id || e.target.name }), true); // never field values
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
})(window, document);
