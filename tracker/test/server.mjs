// Tiny static server for the smoke tests: no Go backend needed.
// Serves test/*.html and the built tracker at /_t/t.js (+ /_t/t.full.js if present).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const routes = {
  '/_t/t.js': here('../../internal/ingest/t.js'),
  '/_t/t.full.js': here('../dist/t.full.js'),
};

http
  .createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (req.method === 'POST' && path === '/_t/e') return res.writeHead(204).end();
    const file = routes[path] ?? (/^\/[\w-]+\.html$/.test(path) ? here('.' + path) : null);
    try {
      if (!file) throw 0;
      const type = file.endsWith('.js') ? 'text/javascript' : 'text/html';
      res.writeHead(200, { 'Content-Type': type }).end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  })
  .listen(4173, '127.0.0.1');
