// Size budget: every built tracker file must be <= 2048 bytes gzipped (level 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const dir = new URL('../../internal/ingest/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^t.*\.js$/.test(f));

test('t.x.js is a real build (not a placeholder)', () => {
  assert.match(readFileSync(new URL('t.x.js', dir), 'utf8'), /__trail/);
});

for (const f of files)
  test(`${f} <= 2048 bytes gzipped`, () => {
    const gz = gzipSync(readFileSync(new URL(f, dir)), { level: 9 }).length;
    assert.ok(gz <= 2048, `${f} is ${gz} bytes gzipped`);
  });

test('t.p.js has no storage code', () => {
  const src = readFileSync(new URL('t.p.js', dir), 'utf8');
  assert.match(src, /__trail/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|cookie/);
});
