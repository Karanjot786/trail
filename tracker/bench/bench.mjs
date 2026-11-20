// Tracker cost benchmark. Rerun: `npm run bench` (add `--save baseline` to write bench/baseline.json).
// Per variant, 5 runs, fresh browser context each. Every number is "page with tracker" minus
// "same page without tracker" (the `none` variant), so the page's own cost cancels out.
//   script ms   CDP Performance.getMetrics ScriptDuration after load
//   heap KB     Runtime.getHeapUsage after HeapProfiler.collectGarbage
//   listeners   addEventListener + setTimeout + setInterval calls (init-script wrappers)
//   requests    POSTs to /_t/e for one pageview: load, 15 s (fake clock), navigate away
import http from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const here = (p) => new URL(p, import.meta.url);
const ingest = (f) => here('../../internal/ingest/' + f);
const RUNS = +process.env.RUNS || 5; // RUNS=15 for a steadier median on a busy machine
const html = readFileSync(here('page.html'), 'utf8');

const variants = [['none', '']];
for (const f of ['t.js', 't.p.js']) {
  // skip files not built yet (missing, or a tiny placeholder)
  if (existsSync(ingest(f)) && readFileSync(ingest(f)).length > 200) variants.push([f, `<script defer src="/_t/${f}" data-site="bench" data-dev></script>`]);
}
variants.push(['t.js full', '<script defer src="/_t/t.js" data-site="bench" data-mode="full" data-dev></script>']);
variants.push(['t.js+x', '<script defer src="/_t/t.js" data-site="bench" data-dev data-vitals data-rage></script>']);
// --ref <file>: also bench an older build in the same run (same machine load), e.g.
//   git show HEAD:internal/ingest/t.js > /tmp/ref.js && node bench/bench.mjs --ref /tmp/ref.js
const ref = process.argv.indexOf('--ref') > 0 ? process.argv[process.argv.indexOf('--ref') + 1] : null;
if (ref) variants.push(['ref', '<script defer src="/_t/ref.js" data-site="bench" data-dev></script>']);
const tags = Object.fromEntries(variants);

let hits = 0;
const server = http
  .createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'POST' && u.pathname === '/_t/e') return hits++, req.resume(), res.writeHead(204).end();
    if (u.pathname.startsWith('/_t/')) {
      const f = u.pathname == '/_t/ref.js' ? ref : ingest(u.pathname.slice(4));
      if (!existsSync(f)) return res.writeHead(404).end();
      return res.writeHead(200, { 'Content-Type': 'application/javascript' }).end(readFileSync(f));
    }
    if (u.pathname === '/p.html') return res.writeHead(200, { 'Content-Type': 'text/html' }).end(html.replace('<!--TRACKER-->', tags[u.searchParams.get('v')] ?? ''));
    res.writeHead(404).end();
  })
  .listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

const counters = () => {
  const w = window;
  w.__n = 0;
  const wrap = (o, k) => {
    const f = o[k];
    o[k] = function () {
      w.__n++;
      return f.apply(this, arguments);
    };
  };
  wrap(EventTarget.prototype, 'addEventListener');
  wrap(w, 'setTimeout');
  wrap(w, 'setInterval');
};

const browser = await chromium.launch();
const run = async (v) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.clock.install();
  await page.addInitScript(counters);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  hits = 0;
  await page.goto(`${base}/p.html?v=${encodeURIComponent(v)}`, { waitUntil: 'load' });
  const t = Date.now();
  while (v !== 'none' && hits < 1 && Date.now() - t < 3000) await new Promise((r) => setTimeout(r, 10));
  await page.waitForTimeout(200);
  const { metrics } = await cdp.send('Performance.getMetrics');
  const script = metrics.find((m) => m.name === 'ScriptDuration').value * 1000;
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = (await cdp.send('Runtime.getHeapUsage')).usedSize / 1024;
  const listeners = await page.evaluate(() => window.__n);
  await page.clock.runFor(15000);
  await page.goto('about:blank');
  await page.waitForTimeout(500);
  const requests = hits;
  await ctx.close();
  return { script, heap, listeners, requests };
};

const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const raw = {};
for (const [v] of variants) await run(v); // warm-up round, discarded
for (let i = 0; i < RUNS; i++) for (const [v] of variants) (raw[v] ??= []).push(await run(v)); // interleaved, so drift hits all variants
await browser.close();
server.close();

const none = Object.fromEntries(['script', 'heap', 'listeners', 'requests'].map((k) => [k, med(raw.none.map((r) => r[k]))]));
const out = {};
for (const [v] of variants.slice(1)) {
  out[v] = {};
  for (const k of ['script', 'heap', 'listeners', 'requests']) {
    const d = raw[v].map((r) => r[k] - none[k]);
    out[v][k] = { median: +med(d).toFixed(2), min: +Math.min(...d).toFixed(2), max: +Math.max(...d).toFixed(2) };
  }
}

const fmt = (o) => `${o.median} (${o.min}..${o.max})`;
console.log('variant   | script ms         | heap KB           | listeners+timers | requests/pageview');
for (const [v, o] of Object.entries(out))
  console.log(`${v.padEnd(9)} | ${fmt(o.script).padEnd(17)} | ${fmt(o.heap).padEnd(17)} | ${fmt(o.listeners).padEnd(16)} | ${fmt(o.requests)}`);

const json = JSON.stringify({ date: new Date().toISOString(), runs: RUNS, results: out }, null, 2) + '\n';
writeFileSync(here('last.json'), json);
const save = process.argv.indexOf('--save');
if (save > 0) writeFileSync(here(`${process.argv[save + 1]}.json`), json);
