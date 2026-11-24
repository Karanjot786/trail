import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { Row, ShareMeta } from '../api/types'
import { BarList, type BarRowModel } from './BarList'
import { columnCatalog, losesMost, overlapNoteFor, panelTabs, toggleColumn, toRows } from './columns'

const siteCtx = vi.hoisted(() => ({ share: null as ShareMeta | null }))
vi.mock('../shell/useSite', () => ({ useSite: () => ({ site: null, sites: [], share: siteCtx.share }) }))
const apiMock = vi.hoisted(() => ({
  breakdown: vi.fn(),
  stats: vi.fn(),
  exportUrl: (path: string, q: URLSearchParams, f: string) => `/api${path}?${q}&format=${f}`,
}))
vi.mock('../api/client', () => ({ api: apiMock }))

vi.mock('../ui/menu', () => ({
  Menu: ({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) => (
    <div>
      {trigger}
      <div role="menu">{children}</div>
    </div>
  ),
  MenuCheckbox: ({ checked, disabled, onCheckedChange, children }: { checked: boolean; disabled?: boolean; onCheckedChange: (c: boolean) => void; children: React.ReactNode }) => (
    <div role="menuitemcheckbox" aria-checked={checked} aria-disabled={disabled ? 'true' : undefined} onClick={() => !disabled && onCheckedChange(!checked)}>
      {children}
    </div>
  ),
  MenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) => (
    <div role="menuitem" onClick={onSelect}>
      {children}
    </div>
  ),
  MenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MenuSeparator: () => <hr />,
}))

import { curlFor, Panel } from './Panel'


afterEach(cleanup)

const row = (key: string, visitors: number, extra: Partial<Row> = {}): Row => ({ key, visitors, pageviews: visitors * 2, total: 0, ...extra })
const cat = columnCatalog({ goalName: 'Signup' })
const model = (rows: Row[], total = 100) => toRows(rows, 'source', cat.visitors, total)

describe('BarList', () => {
  it('scales every bar by the largest value in the list', () => {
    const { getAllByTestId } = render(<BarList rows={model([row('Google', 40), row('X', 20), row('Bing', 20)])} columns={[cat.visitors]} />)
    const bars = getAllByTestId('bar').map((b) => b.style.transform)
    expect(bars[0]).toBe('scaleX(1)')
    expect(bars[1]).toBe('scaleX(0.5)')
    expect(bars[1]).toBe(bars[2])
  })

  it('renders zero as 0 and a missing value as n/a with its reason', () => {
    const rows = model([row('Google', 0, { convRate: undefined })])
    const { container } = render(<BarList rows={rows} columns={[cat.visitors, cat.conv]} />)
    const cells = container.querySelectorAll('.bl-row .c')
    expect(cells[0].firstChild!.textContent).toBe('0')
    expect(cells[1].firstChild!.textContent).toBe('n/a')
    expect(cells[1].textContent).toContain('too few visitors to say')
  })

  it('names the open button after the row and the filter button "Filter by {key}"', () => {
    const onOpen = vi.fn()
    const onFilter = vi.fn()
    const { getByRole } = render(<BarList rows={model([row('Google', 4)])} columns={[cat.visitors]} onOpen={onOpen} onFilter={onFilter} />)
    fireEvent.click(getByRole('button', { name: 'Google' }))
    expect(onOpen).toHaveBeenCalled()
    fireEvent.click(getByRole('button', { name: 'Filter by Google' }))
    expect(onFilter).toHaveBeenCalled()
  })

  it('has no filter button without onFilter', () => {
    const { queryByRole } = render(<BarList rows={model([row('Google', 4)])} columns={[cat.visitors]} />)
    expect(queryByRole('button', { name: /Filter by/ })).toBeNull()
  })

  it('shows the overlap note it is given', () => {
    const { getByTestId } = render(<BarList rows={model([row('a', 1)])} columns={[cat.visitors]} overlapNote="These add up to more than 100%." />)
    expect(getByTestId('overlap-note').textContent).toMatch(/more than 100%/)
  })
})

describe('columns', () => {
  it('notes overlap for sources summing to 118% but never for countries', () => {
    const rows = model([row('Google', 60), row('X', 40), row('Bing', 18)], 100)
    expect(overlapNoteFor('source', rows)).toMatch(/more than 100%/)
    const countries = toRows([row('IN', 60), row('US', 58)], 'country', cat.visitors, 100)
    expect(overlapNoteFor('country', countries)).toBeUndefined()
    expect(overlapNoteFor('source', model([row('Google', 60), row('X', 40)], 100))).toBeUndefined()
  })

  it('keeps every row under "Loses people most", well-viewed pages first', () => {
    const rows: BarRowModel[] = toRows(
      Array.from({ length: 12 }, (_, i) => row(`/p${i}`, 10, { views: i % 2 ? 150 : 8, exits: 5, exitRate: (i + 1) / 20 })),
      'exit',
      cat.exits,
      null,
    )
    const sorted = losesMost(rows)
    expect(sorted).toHaveLength(12)
    expect(sorted.slice(0, 6).every((r) => (r.row.views ?? 0) >= 20)).toBe(true)
    expect(sorted[0].key).toBe('/p11')
  })

  it('refuses to hide the last visible column', () => {
    expect(toggleColumn(['visitors'], 'visitors', false)).toEqual(['visitors'])
    expect(toggleColumn(['visitors', 'share'], 'share', false)).toEqual(['visitors'])
    expect(toggleColumn(['visitors'], 'share', true)).toEqual(['visitors', 'share'])
  })

  it('marks exit rates under 100 views with an asterisk', () => {
    const [r] = toRows([row('/a', 5, { views: 40, exitRate: 0.5 })], 'exit', cat.exits, null)
    const { container } = render(<BarList rows={[r]} columns={[cat.exitRate]} />)
    expect(container.querySelector('.bl-row .c')!.firstChild!.textContent).toBe('50%*')
  })

  it('names the goal column after the goal and says n/a without one', () => {
    expect(columnCatalog({ goalName: 'Signup' }).conv.header).toBe('Signup rate')
    const none = columnCatalog({ goalName: null }).conv
    expect(none.value(model([row('a', 3, { convRate: 0.2 })])[0])).toBeNull()
  })
})

describe('Panel', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/?site=demo')
    siteCtx.share = null
    apiMock.breakdown.mockResolvedValue({ rows: Array.from({ length: 9 }, (_, i) => row(`src${i}`, 90 - i * 10)), total: 12 })
    apiMock.stats.mockResolvedValue({ visitors: 100 })
  })

  it('is a section named by its heading, shows 7 rows and "Show all N"', async () => {
    const { getByRole, findAllByRole } = render(<Panel id="sources" title="Sources" tabs={panelTabs('sources', { goalName: 'Signup' })} />)
    expect(getByRole('region', { name: 'Sources' })).toBeTruthy()
    const filters = await findAllByRole('button', { name: /^Filter by/ })
    expect(filters).toHaveLength(7)
    expect(getByRole('button', { name: /Show all 12 sources/ })).toBeTruthy()
    expect(getByRole('button', { name: 'Panel options' })).toBeTruthy()
  })

  it('opens the row report and toggles a filter through the URL', async () => {
    const { findByRole, getByRole } = render(<Panel id="sources" title="Sources" tabs={panelTabs('sources')} />)
    fireEvent.click(await findByRole('button', { name: 'src0' }))
    expect(new URLSearchParams(location.search).get('dr')).toBe('source|src0')
    history.replaceState(null, '', '/?site=demo')
    fireEvent.click(getByRole('button', { name: 'Filter by src1' }))
    expect(new URLSearchParams(location.search).getAll('f')).toEqual(['source:src1'])
  })

  it('has no Filter buttons in share mode', async () => {
    siteCtx.share = { site: { id: 'demo' } as ShareMeta['site'], state: '', hideRevenue: false, expires: null }
    const { findByRole, queryAllByRole } = render(<Panel id="sources" title="Sources" tabs={panelTabs('sources')} />)
    await findByRole('button', { name: 'src0' })
    expect(queryAllByRole('button', { name: /^Filter by/ })).toHaveLength(0)
  })

  it('share hides export and API menu items', async () => {
    siteCtx.share = { site: { id: 'demo' } as ShareMeta['site'], state: '', hideRevenue: false, expires: null }
    const { findByRole, queryByRole, getByRole } = render(<Panel id="sources" title="Sources" tabs={panelTabs('sources')} />)
    await findByRole('button', { name: 'src0' })
    expect(queryByRole('menuitem', { name: 'Export CSV' })).toBeNull()
    expect(queryByRole('menuitem', { name: 'Export JSON' })).toBeNull()
    expect(queryByRole('menuitem', { name: 'Copy as API call' })).toBeNull()
    expect(getByRole('menuitem', { name: 'Open full report' })).toBeTruthy()
  })

  it('keeps all rows when the exit tab sorts by "Loses people most"', async () => {
    history.replaceState(null, '', '/?site=demo&p.pages=exit')
    apiMock.breakdown.mockResolvedValue({ rows: Array.from({ length: 12 }, (_, i) => row(`/p${i}`, 10, { views: 30, exits: 3, exitRate: i / 12 })), total: 12 })
    const { findByRole, getByRole, container } = render(<Panel id="pages" title="Pages" tabs={panelTabs('pages')} />)
    await findByRole('button', { name: '/p0' })
    fireEvent.click(getByRole('button', { name: 'Loses people most' }))
    await waitFor(() => expect(container.querySelector('.bl-open')!.textContent).toBe('/p11'))
    expect(container.querySelectorAll('.bl-row')).toHaveLength(7)
    expect(getByRole('button', { name: /Show all 12/ })).toBeTruthy()
  })

  it('disables the last ticked column in the Panel options menu', async () => {
    const { findByRole, getAllByRole } = render(<Panel id="location" title="Location" tabs={panelTabs('location')} />)
    await findByRole('button', { name: 'src0' })
    let boxes = getAllByRole('menuitemcheckbox')
    expect(boxes.map((b) => b.textContent)).toEqual(['Visitors', '% of total'])
    expect(boxes.every((b) => b.getAttribute('aria-disabled') !== 'true')).toBe(true)
    fireEvent.click(boxes[1])
    boxes = getAllByRole('menuitemcheckbox')
    expect(boxes[1].getAttribute('aria-checked')).toBe('false')
    expect(boxes[0].getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(boxes[0])
    expect(getAllByRole('menuitemcheckbox')[0].getAttribute('aria-checked')).toBe('true')
  })

  it('opens the full report from the menu and prints the same query as an API call', async () => {
    const { findByRole, getByRole } = render(<Panel id="sources" title="Sources" tabs={panelTabs('sources')} />)
    await findByRole('button', { name: 'src0' })
    fireEvent.click(getByRole('menuitem', { name: 'Open full report' }))
    expect(new URLSearchParams(location.search).get('rep')).toBe('sources:sources')
    const curl = curlFor(new URLSearchParams('site=demo&range=7d'), 'source', 'https://trail.example')
    expect(curl).toContain('Bearer $TRAIL_TOKEN')
    expect(curl).toContain('https://trail.example/api/v1/breakdown?site=demo&range=7d&dim=source')
  })
})

describe('midTrim', () => {
  it('keeps both ends of a long label and leaves short ones alone', async () => {
    const { midTrim } = await import('./BarList')
    expect(midTrim('/pricing')).toBe('/pricing')
    const t = midTrim('/' + 'a'.repeat(200) + '/end')
    expect(t.length).toBe(90)
    expect(t.startsWith('/aaa')).toBe(true)
    expect(t.endsWith('a/end')).toBe(true)
    expect(t).toContain('…')
  })
})
