// Panel columns, panel tabs and the row helpers behind BarList (Task F2-2).
// The one bar rule lives in lib/bar.ts; this file only picks which value the bar follows.
import type { Dim, Row } from '../api/types'
import { fmtInt, fmtMoney, fmtPct } from '../lib/format'
import type { BarRowModel, ColumnDef } from './BarList'
import type { PanelTab } from './Panel'

export const EXIT_SMALL = 100 // an exit rate on fewer views than this carries an asterisk
export const EXIT_MIN = 20 // "Loses people most" ranks pages with at least this many views first

export interface ColumnCtx {
  goalName?: string | null // the conversion goal; null when the site has none
  currency?: string
}

/** Every column a panel can show, by id. */
export function columnCatalog(ctx: ColumnCtx = {}): Record<string, ColumnDef> {
  const goal = ctx.goalName
  return {
    visitors: { id: 'visitors', header: 'Visitors', value: (r) => r.row.visitors, kind: 'count', definition: 'People who visited at least once in this range.' },
    views: { id: 'views', header: 'Views', value: (r) => r.row.pageviews, kind: 'count', definition: 'Page views in this range, every visit counted.' },
    count: { id: 'count', header: 'Count', value: (r) => r.row.total, kind: 'count', definition: 'How many times the event was sent.' },
    share: {
      id: 'share',
      header: '% of total',
      value: (r) => r.share ?? null,
      kind: 'rate',
      muted: true,
      naReason: 'the total for this range is not known yet',
      definition: 'This row’s visitors as a share of all visitors in the range.',
    },
    conv: {
      id: 'conv',
      header: goal ? `${goal} rate` : 'Goal rate',
      value: (r) => (goal ? (r.row.convRate ?? null) : null),
      kind: 'rate',
      muted: true,
      naReason: goal ? 'too few visitors to say' : 'no goal on this site yet; add one in Conversions',
      definition: 'Visitors who reached the goal, of the visitors in this row (first touch).',
    },
    revenue: {
      id: 'revenue',
      header: 'Revenue (first touch)',
      value: (r) => r.row.revenueMinor ?? 0,
      kind: 'money',
      format: (v) => fmtMoney(v, ctx.currency ?? 'USD'),
      definition: 'Purchases reported by your site, credited to where the buyer first came from.',
    },
    sessions: { id: 'sessions', header: 'Sessions', value: (r) => r.row.sessions ?? 0, kind: 'count' },
    bounce: { id: 'bounce', header: 'Bounce rate', value: (r) => r.row.bounce ?? null, kind: 'rate', muted: true, naReason: 'no sessions' },
    entries: { id: 'entries', header: 'Entries', value: (r) => r.row.entries ?? 0, kind: 'count' },
    exits: { id: 'exits', header: 'Exits', value: (r) => r.row.exits ?? 0, kind: 'count', definition: 'Visits that ended on this page.' },
    pviews: { id: 'pviews', header: 'Views', value: (r) => r.row.views ?? r.row.pageviews, kind: 'count', muted: true },
    exitRate: {
      id: 'exitRate',
      header: 'Exit rate',
      value: (r) => r.row.exitRate ?? null,
      kind: 'rate',
      naReason: 'no views',
      format: (v, r) => fmtPct(v) + ((r?.row.views ?? r?.row.pageviews ?? 0) < EXIT_SMALL ? '*' : ''),
      srSuffix: (r) => ((r.row.views ?? r.row.pageviews) < EXIT_SMALL ? ` (fewer than ${EXIT_SMALL} views, a hint only)` : ''),
      definition: `Exits divided by views. An asterisk marks pages with fewer than ${EXIT_SMALL} views.`,
    },
  }
}

/** Format a cell. Zero is "0", never a dash; null is "n/a" (the caller adds the reason). */
export function cellText(c: ColumnDef, r: BarRowModel): string {
  const v = c.value(r)
  if (v == null) return 'n/a'
  if (typeof v === 'string') return v
  if (c.format) return c.format(v, r)
  if (c.kind === 'rate') return fmtPct(v)
  return fmtInt(v)
}

type TabSpec = { value: string; label: string; dim: Dim; cols: string[]; definition?: string }
const TABS: Record<string, TabSpec[]> = {
  pages: [
    { value: 'pages', label: 'Pages', dim: 'path', cols: ['visitors', 'views', 'share'] },
    { value: 'entry', label: 'Entry pages', dim: 'entry', cols: ['visitors', 'conv', 'share'], definition: 'The first page of each visit.' },
    { value: 'exit', label: 'Exit pages', dim: 'exit', cols: ['exits', 'pviews', 'exitRate'], definition: 'The last page of each visit.' },
    { value: 'routes', label: 'Routes', dim: 'route', cols: ['visitors', 'views', 'share'], definition: 'Pages grouped by route pattern.' },
    { value: 'hosts', label: 'Hosts', dim: 'host', cols: ['visitors', 'views', 'share'] },
  ],
  sources: [
    { value: 'sources', label: 'Sources', dim: 'source', cols: ['visitors', 'conv', 'share'], definition: 'Any visit in this range from the source. Goal rates are first touch.' },
    { value: 'channels', label: 'Channels', dim: 'channel', cols: ['visitors', 'conv', 'share'], definition: 'Sources grouped by kind. Direct means no referrer and no UTM tags.' },
    { value: 'ai', label: 'AI referrals', dim: 'ai_source', cols: ['visitors', 'conv', 'share'], definition: 'Visits sent by AI assistants that pass a referrer.' },
    { value: 'campaigns', label: 'Campaigns', dim: 'utm_campaign', cols: ['visitors', 'conv', 'share'], definition: 'Visits tagged with utm_campaign.' },
  ],
  location: [
    { value: 'countries', label: 'Countries', dim: 'country', cols: ['visitors', 'share'] },
    { value: 'regions', label: 'Regions', dim: 'region', cols: ['visitors', 'share'] },
    { value: 'cities', label: 'Cities', dim: 'city', cols: ['visitors', 'share'] },
  ],
  devices: [
    { value: 'devices', label: 'Devices', dim: 'device', cols: ['visitors', 'share'] },
    { value: 'browsers', label: 'Browsers', dim: 'browser', cols: ['visitors', 'share'] },
    { value: 'os', label: 'OS', dim: 'os', cols: ['visitors', 'share'] },
  ],
  events: [{ value: 'events', label: 'Events', dim: 'event', cols: ['visitors', 'count', 'share'] }],
  goals: [{ value: 'goals', label: 'Goals', dim: 'goal', cols: ['visitors', 'share'] }],
}
export const PANEL_TITLES: Record<string, string> = { pages: 'Pages', sources: 'Sources', location: 'Location', devices: 'Devices', events: 'Events', goals: 'Goals' }

/** The tabs of an Overview panel with their columns resolved. */
export function panelTabs(panel: string, ctx: ColumnCtx = {}): PanelTab[] {
  const cat = columnCatalog(ctx)
  return (TABS[panel] ?? []).map((t) => ({ value: t.value, label: t.label, dim: t.dim, columns: t.cols.map((c) => cat[c]), definition: t.definition }))
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    return null
  }
})()

/** The visible label of a row key. */
export function rowLabel(dim: Dim, key: string): string {
  if (!key) return dim === 'source' || dim === 'referrer' || dim === 'channel' ? 'Came directly' : '(none)'
  if (dim === 'country' && /^[A-Z]{2}$/.test(key)) {
    try {
      return regionNames?.of(key) ?? key
    } catch {
      return key
    }
  }
  return key
}

/** Paths, URLs and tags read in Geist Mono. */
export const MONO_DIMS: ReadonlySet<Dim> = new Set<Dim>(['path', 'route', 'host', 'entry', 'exit', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'])

/** Rows → bar rows. The bar follows `barCol`; the share is visitors / all visitors in the range. */
export function toRows(rows: Row[], dim: Dim, barCol: ColumnDef | undefined, totalVisitors: number | null): BarRowModel[] {
  return rows.map((row) => {
    const m: BarRowModel = { key: row.key, label: rowLabel(dim, row.key), value: 0, dim, row, share: totalVisitors && totalVisitors > 0 ? row.visitors / totalVisitors : null }
    const v = barCol ? barCol.value(m) : row.visitors
    m.value = typeof v === 'number' && Number.isFinite(v) ? v : 0
    return m
  })
}

/** Dims whose rows can overlap, so their % of total can sum past 100%. */
const OVERLAP: Partial<Record<Dim, string>> = {
  source: 'Visitors can come from several sources, so these add up to more than 100%.',
  channel: 'Visitors can come through several channels, so these add up to more than 100%.',
  ai_source: 'Visitors can come from several assistants, so these add up to more than 100%.',
  utm_campaign: 'Visitors can arrive through several campaigns, so these add up to more than 100%.',
  path: 'Visitors view several pages, so these add up to more than 100%.',
  entry: 'Visitors can land on several pages over their visits, so these add up to more than 100%.',
  event: 'Visitors can send several events, so these add up to more than 100%.',
}

/** The overlap note when the shares sum past 100%, for dims where rows overlap; otherwise undefined. */
export function overlapNoteFor(dim: Dim, rows: BarRowModel[]): string | undefined {
  const sum = rows.reduce((a, r) => a + (r.share ?? 0), 0)
  return sum > 1.005 ? OVERLAP[dim] : undefined
}

/** "Loses people most": pages with ≥ EXIT_MIN views first by exit rate, the rest after. Never drops a row. */
export function losesMost(rows: BarRowModel[]): BarRowModel[] {
  const views = (r: BarRowModel) => r.row.views ?? r.row.pageviews
  const rate = (r: BarRowModel) => r.row.exitRate ?? 0
  const by = (a: BarRowModel, b: BarRowModel) => rate(b) - rate(a) || views(b) - views(a)
  return [...rows.filter((r) => views(r) >= EXIT_MIN).sort(by), ...rows.filter((r) => views(r) < EXIT_MIN).sort(by)]
}

/** Column visibility: the last visible column cannot be hidden. */
export function toggleColumn(visible: string[], id: string, on: boolean): string[] {
  if (on) return visible.includes(id) ? visible : [...visible, id]
  if (visible.length <= 1 && visible.includes(id)) return visible
  return visible.filter((c) => c !== id)
}
