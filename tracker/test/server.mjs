// Tiny static server for the smoke tests: no Go backend needed.
// Serves test/*.html and the built tracker files at /_t/t*.js.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

http
  .createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (req.method === 'POST' && path === '/_t/e') return res.writeHead(204).end();
    const file = /^\/_t\/t(\.[px])?\.js$/.test(path) ? here('../../internal/ingest/' + path.slice(4)) : /^\/[\w-]+\.html$/.test(path) ? here('.' + path) : null;
    try {
      if (!file) throw 0;
      const type = file.endsWith('.js') ? 'text/javascript' : 'text/html';
      res.writeHead(200, { 'Content-Type': type }).end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  })
  .listen(4173, '127.0.0.1');
