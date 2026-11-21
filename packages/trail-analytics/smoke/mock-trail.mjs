// A stand-in for Trail on :8303 (or $MOCK_PORT) for the framework smoke.
// It records crawl lines and beacons, serves a stub tracker, and checks X-Trail-Proxy
// exactly as §0.12 says Trail does (prefix, ±300 s, constant-time HMAC over the fields and body hash).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

export const STUB_JS = '/* trail smoke stub */';

/** Verifies an X-Trail-Proxy header. Returns '' when valid, else the reason. */
export function verifyProxy(headers, body, { token, site, now = Date.now() / 1000 }) {
  const m = /^v1;k=([^;]+);t=(\d+);s=([0-9a-f]{64})$/.exec(headers['x-trail-proxy'] ?? '');
  if (!m) return 'malformed';
  const [, k, t, s] = m;
  if (k !== token.slice(0, 12)) return 'prefix';
  if (Math.abs(now - Number(t)) > 300) return 'stale';
  const key = createHash('sha256').update(token).digest();
  const msg = ['v1', site, t, headers['x-trail-ip'] ?? '', headers['x-trail-geo'] ?? '', headers['x-trail-geo-src'] ?? '', headers['x-trail-host'] ?? '', createHash('sha256').update(body).digest('hex')].join('\n');
  const want = createHmac('sha256', key).update(msg).digest();
  const got = Buffer.from(s, 'hex');
  return got.length === want.length && timingSafeEqual(got, want) ? '' : 'hmac';
}

export function startMock({ port = Number(process.env.MOCK_PORT ?? 8303), token = 'tk_smoke_0123456789', site = 'demo' } = {}) {
  const state = { crawls: [], beacons: [], js: 0, echo: [], total: 0 };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, 'http://mock');
      if (req.method === 'POST' && url.pathname === '/api/v1/crawls') {
        const ok = req.headers.authorization === `Bearer ${token}`;
        for (const l of body.toString('utf8').split('\n').filter(Boolean)) state.total++, state.crawls.push({ ok, site: url.searchParams.get('site'), line: JSON.parse(l) });
        res.writeHead(ok ? 202 : 401, { 'content-type': 'application/json' }).end('{"accepted":1,"kept":1}');
      } else if (url.pathname === '/_t/t.js') {
        state.js++;
        res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=60' }).end(STUB_JS);
      } else if (req.method === 'POST' && url.pathname === '/_t/e') {
        state.beacons.push({ headers: req.headers, body: body.toString('utf8'), verdict: verifyProxy(req.headers, body, { token, site }) });
        res.writeHead(202).end();
      } else if (url.pathname === '/echo') {
        state.echo.push({ method: req.method, headers: req.headers, body: body.toString('utf8') });
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ headers: req.headers }));
      } else if (url.pathname === '/__state') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(state));
      } else res.writeHead(404).end();
    });
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ server, state, port, close: () => new Promise((r) => server.close(r)) })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = await startMock();
  console.log(`mock Trail on http://127.0.0.1:${m.port}`);
}
