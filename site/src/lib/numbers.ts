// Build-time numbers for the landing page and docs.
// Sizes come from the built tracker files; timings come from tracker/bench/last.json
// when the benchmark has been run. Anything missing is left out, never guessed.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

// Astro runs the build from site/, so the repo root is one level up.
const repo = (p: string) => resolve(process.cwd(), '..', p);

export type Stat = { value: string; unit: string; label: string };

function gz(file: string): number | undefined {
  const p = repo('internal/ingest/' + file);
  if (!existsSync(p)) return;
  // Skip placeholder files that a fresh checkout ships before the tracker is built.
  if (statSync(p).size < 300) return;
  return gzipSync(readFileSync(p), { level: 9 }).length;
}

type Metric = { median: number; min: number; max: number };
type Bench = { date: string; runs: number; results: Record<string, Record<string, Metric>> };

function bench(): Bench | undefined {
  const p = repo('tracker/bench/last.json');
  if (!existsSync(p)) return;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return;
  }
}

function binaryMB(): number | undefined {
  const p = repo('trail');
  if (!existsSync(p) || !statSync(p).isFile()) return;
  return statSync(p).size / 1e6;
}

export const sizes = { full: gz('t.js'), private: gz('t.p.js'), extras: gz('t.x.js') };
export const benchData = bench();
export const binary = binaryMB();

export function stats(): Stat[] {
  const out: Stat[] = [];
  if (sizes.private) out.push({ value: sizes.private.toLocaleString('en-US'), unit: 'B', label: 'Private tracker, t.p.js, gzipped' });
  if (sizes.full) out.push({ value: sizes.full.toLocaleString('en-US'), unit: 'B', label: 'Full tracker, t.js, gzipped' });
  const r = benchData?.results?.['t.js'];
  if (r?.script) out.push({ value: r.script.median.toFixed(1), unit: 'ms', label: 'Script time at page load' });
  if (r?.heap) out.push({ value: Math.max(0, r.heap.median).toFixed(0), unit: 'KB', label: 'Memory added to the page' });
  if (r?.requests) out.push({ value: String(r.requests.median), unit: '', label: 'Requests per pageview' });
  if (binary) out.push({ value: binary.toFixed(0), unit: 'MB', label: 'Server binary, dashboard included' });
  return out;
}
