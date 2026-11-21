// What changed (Task F2-4): the server's ranked movers (GET /api/changes), each a shortcut and each
// labelled with its own basis. A day item zooms to that day, a source item adds a filter, a rate item
// puts that metric on the chart. This is the only place a day is compared with the day before.
import { ArrowDown, ArrowUp, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../api/client'
import type { ChangeItem, Changes, Window } from '../../api/types'
import { useQuery } from '../../api/useQuery'
import { compare } from '../../lib/compare'
import { fmtDay, fmtInt, fmtPct, fmtShortDay } from '../../lib/format'
import { dayIso } from './metrics'
import { valueLabel } from '../../shell/labels'
import { navigate, useUrlState } from '../../state/useUrlState'
import { Dialog } from '../../ui/dialog'
import { toggleFilter } from '../../data/Panel'
import { useApiQuery } from './useOverviewData'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-11-12" → "Nov 12". */
export function isoDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return m && d ? `${MON[m - 1]} ${d}` : iso
}
/** The visible basis, short like the prototype: "prev. 30 days"; the accessible name keeps the full one. */
export function shortBasis(b: string): string {
  const m = /\(the previous (\d+) days\)$/.exec(b)
  if (m) return `prev. ${m[1]} days`
  const p = /\((the [^)]+)\)$/.exec(b)
  return p ? p[1] : b.replace(/^vs /, '')
}
const RATE_LABEL = { bounce: 'Bounce rate', conversion: 'Goal rate' } as const

function Arrow({ up }: { up: boolean | null }) {
  if (up == null) return null
  const A = up ? ArrowUp : ArrowDown
  return <A size={12} aria-hidden="true" />
}

/** The visible text and accessible name of one item. */
export function describeItem(it: ChangeItem, goalName?: string | null): { name: string; node: React.ReactNode } {
  if (it.kind === 'day') {
    const d = compare(it.cur, it.prev, 'count', 'up')
    const add = `${it.added >= 0 ? '+' : '−'}${fmtInt(Math.abs(it.added))} visitors`
    const src = it.source ? valueLabel('source', it.source) : null
    const name = `Biggest jump, ${isoDay(it.day)}: ${add} (${d.sign}${d.text}), ${it.cur} vs ${it.prev} the day before${src ? `, from ${src}` : ''}. Zoom into ${it.day}`
    return {
      name,
      node: (
        <>
          <span className="wc-k">Biggest jump</span>
          <b>{isoDay(it.day)}</b>
          <span className={`wc-d ${d.tone}`}>
            <Arrow up={d.up} />
            {add} <span className="wc-pc">({d.sign}{d.text})</span>
          </span>
          <span className="wc-s">
            {it.cur} vs {it.prev} the day before{src ? `, from ${src}` : ''}
          </span>
        </>
      ),
    }
  }
  if (it.kind === 'source') {
    const diff = it.cur - it.prev
    const up = diff > 0
    const label = valueLabel('source', it.key)
    const txt = `${up ? '+' : '−'}${fmtInt(Math.abs(diff))} visitors`
    return {
      name: `${label}: ${txt}, ${it.basis}. Filter by this source`,
      node: (
        <>
          <b>{label}</b>
          <span className={`wc-d ${up ? 'good' : 'bad'}`}>
            <Arrow up={up} />
            {txt}
          </span>
          <span className="wc-s">{shortBasis(it.basis)}</span>
        </>
      ),
    }
  }
  const label = it.metric === 'conversion' && goalName ? `${goalName} rate` : RATE_LABEL[it.metric]
  const d = compare(it.cur, it.prev, 'rate', it.metric === 'bounce' ? 'down' : 'up', it.n)
  const spoken = d.text.replace(/ pt$/, ' points')
  return {
    name: `${label} ${fmtPct(it.cur)}, ${d.up == null ? spoken : `${d.up ? 'up' : 'down'} ${spoken}`}, ${it.basis}. Show it on the chart`,
    node: (
      <>
        <b>{label}</b>
        <span className={`wc-d ${d.tone}`}>
          <Arrow up={d.up} />
          {d.sign}
          {d.text}
        </span>
        <span className="wc-s">
          {fmtPct(it.prev)} → {fmtPct(it.cur)}, {shortBasis(it.basis)}
        </span>
      </>
    ),
  }
}

/** The ISO day of a day item: the API may send "2026-11-12" or a label like "Thu, Nov 12" within the window. */
export function dayToIso(day: string, w: Pick<Window, 'from' | 'to' | 'tz'> | undefined): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day
  if (!w) return null
  for (let t = w.from; t <= w.to + 36e5; t += 864e5) if (fmtDay(t, w.tz) === day || fmtShortDay(t, w.tz) === day) return dayIso(t, w.tz)
  return null
}

export function WhatChanged({ goalName, window: w }: { goalName?: string | null; window?: Window }) {
  const s = useUrlState()
  const { q, key } = useApiQuery()
  const r = useQuery<Changes>(`changes|${key}`, async (sig) => api.changes(q, sig), { enabled: !!s.site && s.site !== 'all' })
  const [method, setMethod] = useState(false)
  const items = (r.data?.items ?? []).slice(0, 4)
  if (!items.length) return null
  const act = (it: ChangeItem) => {
    if (it.kind === 'day') {
      const iso = dayToIso(it.day, w)
      if (iso) navigate({ range: `d:${iso}` })
    }
    else if (it.kind === 'source') navigate({ filters: toggleFilter(s.filters, 'source', it.key) })
    else navigate({ metric: it.metric })
  }
  return (
    <section className="wc" aria-labelledby="wc-h">
      <h2 id="wc-h">
        <Sparkles size={14} aria-hidden="true" />
        What changed
      </h2>
      <ul className="wc-list">
        {items.map((it, i) => {
          const { name, node } = describeItem(it, goalName)
          return (
            <li key={i}>
              <button type="button" className="wc-i" aria-describedby={`wc-d${i}`} onClick={() => act(it)}>
                {node}
              </button>
              <span id={`wc-d${i}`} className="sr-only">
                {name}
              </span>
            </li>
          )
        })}
      </ul>
      <button type="button" className="wc-m" onClick={() => setMethod(true)}>
        How it is worked out
      </button>
      <Dialog open={method} onOpenChange={setMethod} title="How “What changed” is worked out" size="sm">
        <p>
          Plain arithmetic, no AI. The day that added the most visitors against the day before, the source with the biggest gain or loss over the range, and
          bounce or goal rate when they moved by a point or more. At most four items. This strip is the only place Trail compares a day with the day before; each
          item says what it is compared with.
        </p>
      </Dialog>
    </section>
  )
}
