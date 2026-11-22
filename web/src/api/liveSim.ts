// Simulated Live for the server-less demo (plan §0.13). The recording holds the last 30 minutes of events.
// It is replayed as a clock: a playhead moves through the recording in real time (looping), the stream is
// the 5 minutes before the playhead, shifted so the playhead is `now`, and every count is recomputed from it.
// A shown event keeps its timestamp from poll to poll, so it ages and drops out like a real one.
import type { Live, LiveEvent } from './types'

export const LIVE_WINDOW_MS = 5 * 60_000
export const RECORDED_SPAN_MS = 30 * 60_000

function top(stream: LiveEvent[], key: (e: LiveEvent) => string): { key: string; count: number }[] {
  const people = new Map<string, Set<string>>()
  for (const e of stream) {
    const k = key(e)
    if (!k) continue
    let set = people.get(k)
    if (!set) people.set(k, (set = new Set()))
    set.add(e.person)
  }
  return [...people.entries()].map(([k, s]) => ({ key: k, count: s.size })).sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1))
}

/** Where the playhead is in recorded time: starts 5 minutes into the recording and loops. */
export function playhead(asOf: number, now: number, span = RECORDED_SPAN_MS): number {
  const loop = span - LIVE_WINDOW_MS
  const d = (((now - asOf) % loop) + loop) % loop
  return asOf - loop + d
}

/**
 * A recording shorter than the replay span (the recorder keeps only Live's own 5-minute window) is
 * repeated back in time until it covers the span, so the replay never runs through empty minutes.
 */
export function fillSpan(recorded: Live, span = RECORDED_SPAN_MS): LiveEvent[] {
  if (!recorded.stream.length) return recorded.stream
  const start = recorded.asOf - span
  const first = Math.min(...recorded.stream.map((e) => e.ts))
  if (first <= start + LIVE_WINDOW_MS) return recorded.stream
  const period = Math.max(recorded.asOf - first + 15_000, 60_000)
  const out: LiveEvent[] = []
  for (let k = 0; recorded.asOf - k * period > start; k++) {
    for (const e of recorded.stream) {
      const ts = e.ts - k * period
      if (ts > start) out.push(k ? { ...e, ts } : e)
    }
  }
  return out
}

export function simulateLive(recorded: Live, now: number, span = RECORDED_SPAN_MS): Live {
  const head = playhead(recorded.asOf, now, span)
  const shift = now - head
  const stream: LiveEvent[] = []
  for (const e of fillSpan(recorded, span)) {
    if (e.ts > head - LIVE_WINDOW_MS && e.ts <= head) stream.push({ ...e, ts: e.ts + shift })
  }
  stream.sort((a, b) => b.ts - a.ts)
  return {
    asOf: now,
    active: new Set(stream.map((e) => e.person)).size,
    events5m: stream.length,
    countries: top(stream, (e) => e.country),
    sources: top(stream, (e) => e.source),
    pages: top(stream, (e) => (e.type === 'pageview' ? e.path : '')),
    stream,
    streamTotal: stream.length,
  }
}
