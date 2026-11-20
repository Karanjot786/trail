// Trail opt-in extras, loaded by t.js / t.p.js only when data-vitals or data-rage is set.
// Reports through the core's window.__trail(type, extra); does nothing without it.
((w: any, d: Document) => {
  const D = (d.currentScript as HTMLScriptElement).dataset;
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
})(window, document);
