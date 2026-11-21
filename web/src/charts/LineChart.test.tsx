import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { Point, Window } from '../api/types'
import { LineChart } from './LineChart'
import { BarsChart } from './BarsChart'
import { StackedBars } from './StackedBars'
import { Sparkline } from './Sparkline'

afterEach(cleanup)

const DAY = 86_400_000
const T0 = Date.UTC(2026, 10, 14)
const win = (over: Partial<Window> = {}): Window => ({
  key: '7d', label: 'Last 7 days', from: T0, to: T0 + 7 * DAY - 1, prevFrom: T0 - 7 * DAY, prevTo: T0 - 1,
  bucket: 'day', tz: 'UTC', elapsed: false, lastBucket: 6, clamped: false, invalid: '',
  basis: { text: 'vs Nov 7 – Nov 13 (the previous 7 days)', short: 'previous 7 days', why: '', dates: 'Nov 7 – Nov 13', custom: false, none: false },
  ...over,
})
const pts = (vs: (number | null)[]): Point[] => vs.map((v, i) => ({ t: T0 + i * DAY, v }))

describe('LineChart', () => {
  it('names the figure and draws no point for null buckets', () => {
    const { getByRole, container } = render(
      <LineChart points={pts([3, 5, 8, 4, 9, null, null])} window={win({ lastBucket: 4 })} color="var(--chart-1)" height={240} ariaLabel="Visitors per day" kind="count" />,
    )
    expect(getByRole('figure', { name: /Visitors per day/ })).toBeTruthy()
    expect(container.querySelectorAll('circle.pt')).toHaveLength(5)
    expect([...container.querySelectorAll('circle')].filter((c) => !c.closest('defs'))).toHaveLength(5)
  })

  it('draws the previous period as a separate dashed path', () => {
    const { container } = render(
      <LineChart points={pts([3, 5, 8])} prev={pts([2, null, 6])} window={win({ lastBucket: 2 })} color="var(--chart-1)" height={240} ariaLabel="Visitors per day" kind="count" />,
    )
    const prev = container.querySelector('path.prev')!
    expect(prev).toBeTruthy()
    expect(prev.getAttribute('d')!.match(/M/g)).toHaveLength(2)
  })

  it('dots the running bucket when the window has not ended', () => {
    const { container } = render(
      <LineChart points={pts([3, 5, 8, 2])} window={win({ lastBucket: 3, elapsed: true })} color="var(--chart-1)" height={240} ariaLabel="Visitors per day" kind="count" />,
    )
    expect(container.querySelector('path.partial')).toBeTruthy()
  })

  it('draws a diamond per note and a goal mark per day with signups', () => {
    const { container } = render(
      <LineChart
        points={pts([3, 5, 8, 4])}
        window={win({ lastBucket: 3 })}
        color="var(--chart-1)"
        height={240}
        ariaLabel="Visitors per day"
        kind="count"
        notes={[{ id: 1, site: 's', ts: T0 + DAY + 5000, label: 'Launch', kind: 'deploy' }]}
        lane={[{ t: T0, count: 0 }, { t: T0 + 2 * DAY, count: 2 }]}
      />,
    )
    expect(container.querySelectorAll('.note-m')).toHaveLength(1)
    expect(container.querySelectorAll('.goal-d')).toHaveLength(1)
  })

  it('steps with arrow keys, Home and End, never past the last real bucket, and Enter picks', () => {
    const onHover = vi.fn()
    const onPick = vi.fn()
    const { getByRole } = render(
      <LineChart points={pts([3, 5, 8, null])} window={win({ lastBucket: 2 })} color="var(--chart-1)" height={240} ariaLabel="Visitors per day" kind="count" onHover={onHover} onPick={onPick} />,
    )
    const fig = getByRole('figure')
    fireEvent.keyDown(fig, { key: 'End' })
    expect(onHover).toHaveBeenLastCalledWith(2)
    fireEvent.keyDown(fig, { key: 'ArrowRight' })
    expect(onHover).toHaveBeenLastCalledWith(2)
    fireEvent.keyDown(fig, { key: 'Home' })
    expect(onHover).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(fig, { key: 'ArrowRight' })
    expect(onHover).toHaveBeenLastCalledWith(1)
    fireEvent.keyDown(fig, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(1)
    fireEvent.keyDown(fig, { key: 'Escape' })
    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it('shows the floating card on fine pointers and announces the bucket', () => {
    const { getByRole, getByTestId, container } = render(
      <LineChart
        points={pts([3, 5, 8])}
        prev={pts([1, 2, 3])}
        window={win({ lastBucket: 2 })}
        color="var(--chart-1)"
        height={240}
        ariaLabel="Visitors per day"
        kind="count"
        renderCard={(i) => <span>card {i}</span>}
        describe={(i) => `bucket ${i}`}
      />,
    )
    act(() => {
      fireEvent.keyDown(getByRole('figure'), { key: 'Home' })
    })
    expect(getByTestId('chart-card').textContent).toContain('card 0')
    expect(container.querySelector('[aria-live="polite"]')!.textContent).toBe('bucket 0')
  })
})

describe('BarsChart', () => {
  it('draws one bar per non-zero bucket and a dashed tick for the previous period', () => {
    const { container, getByRole } = render(
      <BarsChart points={pts([1200, 0, 900, null])} prev={pts([1000, 500, 0, null])} window={win({ lastBucket: 2 })} color="var(--chart-bar)" height={200} ariaLabel="Net revenue per day" money="USD" />,
    )
    expect(getByRole('figure', { name: /Net revenue per day/ })).toBeTruthy()
    expect(container.querySelectorAll('.vbar')).toHaveLength(2)
    expect(container.querySelectorAll('line.ptick')).toHaveLength(2)
  })
})

describe('StackedBars', () => {
  it('stacks one segment per non-zero key, in key order', () => {
    const { container } = render(
      <StackedBars
        series={[
          { t: T0, values: { training: 3, indexing: 2, fetch: 0 } },
          { t: T0 + DAY, values: { training: 1, indexing: 0, fetch: 4 } },
        ]}
        keys={[
          { key: 'training', label: 'Training', color: 'var(--chart-1)' },
          { key: 'indexing', label: 'Indexing', color: 'var(--chart-2)' },
          { key: 'fetch', label: 'Fetch', color: 'var(--chart-3)' },
        ]}
        window={win({ lastBucket: 1 })}
        height={200}
        ariaLabel="Crawler requests per day"
      />,
    )
    const groups = container.querySelectorAll('g.stack')
    expect(groups).toHaveLength(2)
    expect(groups[0].querySelectorAll('rect.seg')).toHaveLength(2)
    expect(groups[1].querySelectorAll('rect.seg')).toHaveLength(2)
  })
})

describe('Sparkline', () => {
  it('breaks at nulls and is hidden from screen readers', () => {
    const { container } = render(<Sparkline values={[1, 3, null, 2, 4]} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelector('path.spark-line')!.getAttribute('d')!.match(/M/g)).toHaveLength(2)
  })
})
