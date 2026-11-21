// The ⌘K command palette (plan F1-6). No open/close animation (it is used many times a day): a Radix Dialog
// with a combobox input and a listbox of options; the input keeps focus and arrows move the active option.
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Dialog as DP } from 'radix-ui'
import {
  Bookmark, Building2, Calendar, Contrast, FileText, Filter, Globe, Hash, Keyboard, Link2, MapPin, PanelLeft, Plus,
  Search, Smartphone, X, Zap,
} from 'lucide-react'
import { api } from '../api/client'
import type { Dim, RangeKey } from '../api/types'
import { useQuery } from '../api/useQuery'
import { apiQuery } from '../state/url'
import { go, navigate, useUrlState } from '../state/useUrlState'
import { Avatar } from '../ui/avatar'
import { Kbd } from '../ui/small'
import { useLayer } from '../ui/layers'
import { fmtInt } from '../lib/format'
import { DIM_LABEL, MONO_DIMS, RANGE_GROUPS, rangeLabel, valueLabel, viewerTz } from './labels'
import { NAV_ICON, NAV_KEY, useNavScreens } from './Sidebar'
import { useSite } from './useSite'
import { setUi, useUi } from './uiStore'
import { toggleTheme } from './theme'
import { toggleRail } from './Header'
import { clearFilters } from './FilterBar'
import { openSaveView, useViews, viewHref } from './SavedViews'
import { announce } from './announce'

type Icon = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
interface Item {
  group: string
  label: string
  sub?: string
  kw?: string
  icon?: Icon
  avatar?: string
  mono?: boolean
  end?: ReactNode
  run: () => void
}

export const FILTER_DIMS: { dim: Dim; label: string; icon: Icon }[] = [
  { dim: 'path', label: 'pages', icon: FileText },
  { dim: 'source', label: 'sources', icon: Globe },
  { dim: 'country', label: 'countries', icon: MapPin },
  { dim: 'device', label: 'devices', icon: Smartphone },
  { dim: 'event', label: 'events', icon: Zap },
  { dim: 'utm_campaign', label: 'campaigns', icon: Hash },
]

function score(o: Item, q: string): number {
  if (!q) return 1
  const hay = `${o.label} ${o.sub ?? ''} ${o.kw ?? ''} ${o.group}`.toLowerCase()
  let s = 0
  for (const part of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    const j = hay.indexOf(part)
    if (j < 0) return 0
    s += j === 0 || o.label.toLowerCase().startsWith(part) ? 3 : 1
  }
  return s
}

export function CommandPalette() {
  const ui = useUi()
  const open = ui.palette != null
  const close = () => setUi({ palette: null })
  useLayer(open, close)
  return (
    <DP.Root open={open} onOpenChange={(o) => !o && close()}>
      <DP.Portal>
        <DP.Overlay className="cmdk-wrap" data-instant="">
          {open && <Palette scope={ui.palette!.scope} instant={ui.palette!.instant} close={close} />}
        </DP.Overlay>
      </DP.Portal>
    </DP.Root>
  )
}

function Palette({ scope, instant, close }: { scope: '' | 'filter'; instant: boolean; close: () => void }) {
  const s = useUrlState()
  const { sites } = useSite()
  const nav = useNavScreens()
  const views = useViews()
  const [q, setQ] = useState('')
  const dq = useDeferredValue(q.trim())
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const share = s.prefix.startsWith('/share/')
  const aq = apiQuery(s, viewerTz())
  const qs = aq.toString()
  const canBreak = !!s.site

  // Filters: the top 20 values per dim in the current window, fetched when the palette opens.
  const tops = FILTER_DIMS.map(({ dim }) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery(`pal|${dim}|${qs}|${s.prefix}`, (sig) => api.breakdown(aq, dim, { limit: 20 }, sig), { enabled: canBreak, staleMs: 60_000 }),
  )
  const people = useQuery(`pal|visitors|${qs}|${dq}|${s.prefix}`, (sig) => api.visitors(aq, { q: dq, limit: 8 }, sig), {
    enabled: scope !== 'filter' && !!s.site && s.site !== 'all' && dq.length > 0,
    staleMs: 30_000,
  })

  const items = useMemo(() => {
    const out: Item[] = []
    const add = (group: string, o: Omit<Item, 'group'>) => out.push({ group, ...o })
    if (scope !== 'filter') {
      for (const r of nav) add('Screens', { icon: NAV_ICON[r.id], label: r.label, kw: `screen ${r.id} ${(r.tabs ?? []).map((t) => t.label).join(' ')}`, end: <Kbd>{`G ${NAV_KEY[r.id]}`}</Kbd>, run: () => navigate({ screen: r.id, tab: '', id: null, sheet: null }) })
      for (const r of nav)
        for (const t of (r.tabs ?? []).slice(1))
          add('Screens', { icon: NAV_ICON[r.id], label: t.label, sub: r.label, kw: `${r.id} ${t.value}`, run: () => navigate({ screen: r.id, tab: t.value, id: null, sheet: null }) })
      if (!share) add('Screens', { icon: NAV_ICON.settings, label: 'Settings', kw: 'install snippet mcp tokens export sharing', end: <Kbd>G S</Kbd>, run: () => navigate({ screen: 'settings', tab: '', id: null, sheet: null }) })
      if (!share) for (const v of views.data ?? []) add('Saved views', { icon: Bookmark, label: v.name, kw: 'view saved pinned', run: () => go(viewHref(v)) })
      if (!share) {
        add('Sites', { icon: Building2, label: 'All websites', kw: 'site switch', run: () => navigate({ site: 'all', filters: [], sheet: null }) })
        for (const x of sites) add('Sites', { icon: Globe, label: x.domain, sub: x.lastEventAt == null ? 'Waiting for first event' : x.id, kw: 'site switch', run: () => navigate({ site: x.id, filters: [], sheet: null }) })
      }
      for (const g of RANGE_GROUPS)
        for (const k of g.keys) add('Ranges', { icon: Calendar, label: rangeLabel(k)[0], kw: 'range date period', end: s.range === k ? <span className="badge" data-tone="blue">on</span> : undefined, run: () => navigate({ range: k as RangeKey }) })
      if (!share) {
        add('Actions', { icon: Link2, label: 'Share a read-only link…', kw: 'share link public expiry', run: () => setUi({ share: true }) })
        add('Actions', { icon: Bookmark, label: 'Save this view to the sidebar', kw: 'save view pin bookmark', end: <Kbd>S</Kbd>, run: () => openSaveView(s.sheet != null) })
        add('Actions', { icon: Plus, label: 'Add a website', kw: 'site new install', run: () => setUi({ addSite: true }) })
      }
      add('Actions', { icon: Contrast, label: `Switch to ${document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'} theme`, kw: 'theme dark light appearance', end: <Kbd>T</Kbd>, run: toggleTheme })
      add('Actions', { icon: PanelLeft, label: 'Collapse or expand the sidebar', kw: 'sidebar rail', end: <Kbd>[</Kbd>, run: () => toggleRail(false) })
      if (!share && s.filters.length) add('Actions', { icon: X, label: 'Clear all filters', kw: 'reset filters', end: <Kbd>Shift X</Kbd>, run: clearFilters })
      add('Actions', { icon: Keyboard, label: 'Keyboard shortcuts', kw: 'help keys', end: <Kbd>?</Kbd>, run: () => setUi({ shortcuts: { instant: false } }) })
    }
    if (!share)
      FILTER_DIMS.forEach(({ dim, label, icon }, i) => {
        for (const r of tops[i].data?.rows ?? []) {
          const on = s.filters.some((f) => f.dim === dim && f.value === r.key)
          const shown = valueLabel(dim, r.key)
          add(`Filter by ${label}`, {
            icon,
            label: shown,
            mono: MONO_DIMS.has(dim),
            sub: `${on ? 'Active filter · ' : ''}${fmtInt(r.visitors)} visitors`,
            kw: `filter ${dim} ${DIM_LABEL[dim]} ${r.key}`,
            end: on ? <span className="badge" data-tone="blue">on</span> : undefined,
            run: () => {
              const rest = s.filters.filter((f) => f.dim !== dim)
              navigate({ filters: on ? rest : [...rest, { dim, value: r.key }] })
              announce(on ? `Filter removed: ${DIM_LABEL[dim]} is ${shown}.` : `${DIM_LABEL[dim]} is ${shown}. Filter added. Press Back to undo.`)
            },
          })
        }
      })
    if (scope !== 'filter')
      for (const p of people.data?.rows ?? [])
        add('Visitors', {
          avatar: p.person,
          label: p.label,
          sub: `${p.source ? `Came from ${p.source}` : 'Came directly'} · ${p.visits} ${p.visits === 1 ? 'visit' : 'visits'}`,
          kw: `visitor journey person ${p.city} ${p.country}`,
          run: () => navigate({ screen: s.screen === 'settings' ? 'activity' : s.screen, sheet: { kind: 'journey', person: p.person } }),
        })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, nav, views.data, sites, s, share, people.data, ...tops.map((t) => t.data)])

  const groups = useMemo(() => {
    const res = items.map((o) => ({ o, s: score(o, dq) })).filter((x) => x.s > 0)
    if (dq) res.sort((a, b) => b.s - a.s)
    const per = dq ? 8 : 6
    const map = new Map<string, Item[]>()
    for (const { o } of res) {
      const g = map.get(o.group) ?? []
      if (g.length < per) g.push(o)
      map.set(o.group, g)
    }
    return [...map.entries()]
  }, [items, dq])
  const flat = groups.flatMap(([, g]) => g)
  const active = Math.min(sel, Math.max(0, flat.length - 1))

  useEffect(() => setSel(0), [dq])
  useEffect(() => {
    listRef.current?.querySelector(`#cmdk-${active}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  const run = (i: number) => {
    const o = flat[i]
    if (!o) return
    close()
    o.run()
  }

  let idx = -1
  return (
    <DP.Content className="cmdk" aria-label="Command palette" aria-describedby={undefined} data-instant={instant ? '' : undefined} onClick={(e) => e.stopPropagation()}>
      <DP.Title className="sr-only">Command palette</DP.Title>
      <div className="cmdk-in">
        <Search size={16} aria-hidden="true" />
        {scope === 'filter' && (
          <span className="scope">
            <Filter size={12} aria-hidden="true" />
            Filter
          </span>
        )}
        <input
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmdk-list"
          aria-autocomplete="list"
          aria-label={scope === 'filter' ? 'Filter by' : 'Search or jump to'}
          aria-activedescendant={flat.length ? `cmdk-${active}` : undefined}
          placeholder={scope === 'filter' ? 'Filter by page, source, country, device, event…' : 'Jump to a screen, site, page, visitor or goal…'}
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel(Math.min(flat.length - 1, active + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel(Math.max(0, active - 1))
            } else if (e.key === 'Home' && e.ctrlKey) setSel(0)
            else if (e.key === 'Enter') {
              e.preventDefault()
              run(active)
            }
          }}
        />
        <Kbd>Esc</Kbd>
      </div>
      <div className="cmdk-list" id="cmdk-list" role="listbox" aria-label="Results" ref={listRef}>
        {flat.length === 0 ? (
          <div className="cmdk-empty">{`Nothing matches “${q}”. Try a page path, a country, a source or a visitor ID.`}</div>
        ) : (
          groups.map(([g, list]) => (
            <div key={g} role="group" aria-label={g}>
              <div className="cmdk-g" aria-hidden="true">
                {g}
              </div>
              {list.map((o) => {
                idx++
                const i = idx
                const Icon = o.icon
                return (
                  <div
                    key={`${g}|${o.label}|${i}`}
                    id={`cmdk-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className="cmdk-i"
                    onMouseMove={() => i !== active && setSel(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => run(i)}
                  >
                    <span className="ic">{o.avatar ? <Avatar seed={o.avatar} size={20} /> : Icon ? <Icon size={14} aria-hidden /> : null}</span>
                    <span className="tx">
                      <b className={o.mono ? 'mono' : undefined}>{o.label}</b>
                      {o.sub && <span>{o.sub}</span>}
                    </span>
                    <span className="end">{o.end}</span>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
      <div className="cmdk-f" aria-hidden="true">
        <span>
          <Kbd>↑ ↓</Kbd> to move
        </span>
        <span>
          <Kbd>↵</Kbd> to choose
        </span>
        <span>Choosing a page, source or country filters the whole dashboard.</span>
      </div>
    </DP.Content>
  )
}
