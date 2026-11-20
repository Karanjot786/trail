// Size budget: every built tracker file must be <= 2048 bytes gzipped (level 9).
// Measured two ways, and both must pass: different zlib builds (Node 22 vs 26, Go, nginx)
// compress the same bytes a few bytes differently, so one number can pass here and fail in CI.
// deflateRaw + 18 is the same stream plus the 10-byte gzip header and 8-byte trailer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { deflateRawSync, gzipSync } from 'node:zlib';

const dir = new URL('../../internal/ingest/', import.meta.url);
const files = readdirSync(dir).filter((f) => /^t.*\.js$/.test(f));

test('t.x.js is a real build (not a placeholder)', () => {
  assert.match(readFileSync(new URL('t.x.js', dir), 'utf8'), /__trail/);
});

for (const f of files)
  test(`${f} <= 2048 bytes gzipped`, () => {
    const b = readFileSync(new URL(f, dir));
    const gz = gzipSync(b, { level: 9 }).length;
    const raw = deflateRawSync(b, { level: 9 }).length + 18;
    assert.ok(gz <= 2048, `${f} is ${gz} bytes gzipped`);
    assert.ok(raw <= 2048, `${f} is ${raw} bytes as deflateRaw + 18`);
  });

test('t.p.js has no storage code', () => {
  const src = readFileSync(new URL('t.p.js', dir), 'utf8');
  assert.match(src, /__trail/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|cookie/);
});
