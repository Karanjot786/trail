---
title: Tracker cost
description: How big the tracker is, what it costs a page to load, and how to measure it yourself.
---

<script setup>
import CostTable from '../.vitepress/components/CostTable.vue'
</script>

# Tracker cost

Trail publishes what its tracker costs. The table below is filled in when this site is built: sizes are gzipped (level 9) from the files the server embeds, and timings come from the last benchmark run in `tracker/bench/last.json`.

<CostTable />

## Rules the build enforces

- Every tracker file is at most **2,048 bytes** gzipped. `tracker/build.mjs` fails the build if one is over, and a test in CI checks it again. Today `t.p.js` is 1,532 bytes, `t.js` is 2,034 and `t.x.js` is 888.
- The limit holds under two measurements: `gzip -9`, and raw deflate plus 18 bytes of header. Zlib builds differ by a few bytes, so the file has to fit under both.
- Script time at load is checked before and after every tracker change.

## How the server delivers it

The server compresses each tracker file once at startup, at the best gzip level, and sends that copy to any browser that accepts gzip. Every response carries an `ETag`, and a repeat request with `If-None-Match` gets a `304` with no body. Files are cacheable for an hour (`Cache-Control: public, max-age=3600`). The sizes in the table are what travels over the wire.

## How the benchmark works

`tracker/bench/bench.mjs` starts a local server that serves a 9,000 px tall test page and the built tracker files, and answers `/_t/e` with 204. For each variant (no tracker, `t.js`, `t.p.js` when built, `t.js` with `data-mode="full"`, and `t.js` with vitals and rage clicks) it opens a fresh Chromium context and measures:

- **Script time**: CDP `ScriptDuration` after load, minus the same page without a tracker.
- **Heap**: JS heap used after a forced garbage collection, minus the page without a tracker.
- **Listeners and timers** added, by wrapping `addEventListener`, `setTimeout` and `setInterval`.
- **Requests per pageview**: load, wait 15 simulated seconds, then navigate away, and count the `POST /_t/e` requests.

Each variant runs several times, interleaved so machine noise hits all of them equally, and the table reports the median with the range.

## Run it yourself

```sh
cd tracker
npm ci
npx playwright install chromium
npm run bench              # builds, then benchmarks; RUNS=15 for a steadier median
```

It prints a table and writes `bench/last.json`, which this page reads on the next build.

## Next

- Pick a smaller file: [privacy modes](/tracking/privacy).
- Turn on [extras](/tracking/extras) only when you need them.
