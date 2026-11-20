<script setup lang="ts">
import { data } from './cost.data'

const files = [
  ['t.p.js', 'Private only', data.sizes.private],
  ['t.js', 'All three modes; private until consent by default', data.sizes.full],
  ['t.x.js', 'Extras: web vitals, rage clicks, form submits and errors, loaded only when asked for', data.sizes.extras],
] as const

const labels: Record<string, string> = {
  't.js': 't.js, default mode',
  't.js full': 't.js, data-mode="full"',
  't.p.js': 't.p.js',
  't.js+x': 't.js with vitals and rage clicks',
}

const bench = data.bench
const rows = bench ? Object.entries(bench.results).filter(([v]) => v in labels) : []

type Metric = { median: number; min: number; max: number }
const fmt = (m: Metric | undefined, digits = 1) =>
  m ? `${m.median.toFixed(digits)} (${m.min.toFixed(digits)} to ${m.max.toFixed(digits)})` : 'not measured'
const bytes = (b?: number) => (b ? `${b.toLocaleString('en-US')} B` : 'not built')
</script>

<template>
  <table>
    <thead>
      <tr><th>File</th><th>What it does</th><th>Gzipped</th></tr>
    </thead>
    <tbody>
      <tr v-for="[file, what, size] in files" :key="file">
        <td><code>{{ file }}</code></td>
        <td>{{ what }}</td>
        <td>{{ bytes(size) }}</td>
      </tr>
    </tbody>
  </table>

  <template v-if="bench">
    <table>
      <thead>
        <tr><th>Variant</th><th>Script ms</th><th>Heap KB</th><th>Listeners and timers</th><th>Requests per pageview</th></tr>
      </thead>
      <tbody>
        <tr v-for="[variant, m] in rows" :key="variant">
          <td>{{ labels[variant] }}</td>
          <td>{{ fmt(m.script, 2) }}</td>
          <td>{{ fmt(m.heap, 0) }}</td>
          <td>{{ fmt(m.listeners, 0) }}</td>
          <td>{{ fmt(m.requests, 0) }}</td>
        </tr>
      </tbody>
    </table>
    <p>Median (min to max) of {{ bench.runs }} runs, measured {{ bench.date.slice(0, 10) }}.</p>
  </template>
  <p v-else>
    Timings are not included in this build. Run <code>npm run bench</code> in <code>tracker/</code> (see below) to measure script time, heap, listeners and requests on your machine; the result is written to <code>tracker/bench/last.json</code> and shows up here on the next build.
  </p>
</template>
