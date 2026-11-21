import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { HeatmapGrid, heatColor } from './HeatmapGrid'

afterEach(cleanup)

const cells = Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (d === 1 && h === 10 ? 8 : h % 5)))

describe('HeatmapGrid', () => {
  it('is one grid with a single tab stop, starting on the peak', () => {
    const { getByRole, container } = render(<HeatmapGrid cells={cells} max={8} peak={{ dow: 1, hour: 10, value: 8 }} clear onPick={() => {}} />)
    expect(getByRole('grid', { name: 'Visitors by weekday and hour' })).toBeTruthy()
    const stops = container.querySelectorAll('[role="gridcell"][tabindex="0"]')
    expect(stops).toHaveLength(1)
    expect(stops[0].getAttribute('aria-label')).toMatch(/^Tuesday 10:00, 8 visitors/)
  })

  it('moves focus with arrows, Home and End', () => {
    const { container } = render(<HeatmapGrid cells={cells} max={8} peak={{ dow: 1, hour: 10, value: 8 }} clear onPick={() => {}} />)
    const start = container.querySelector<HTMLElement>('[tabindex="0"]')!
    start.focus()
    fireEvent.keyDown(start, { key: 'ArrowRight' })
    expect(document.activeElement!.getAttribute('aria-label')).toMatch(/^Tuesday 11:00/)
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement!.getAttribute('aria-label')).toMatch(/^Wednesday 11:00/)
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(document.activeElement!.getAttribute('aria-label')).toMatch(/^Wednesday 23:00/)
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(document.activeElement!.getAttribute('aria-label')).toMatch(/^Wednesday 00:00/)
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
  })

  it('Enter picks weekday and hour and focus stays in the grid', () => {
    const onPick = vi.fn()
    const { container, getByRole } = render(<HeatmapGrid cells={cells} max={8} peak={{ dow: 1, hour: 10, value: 8 }} clear onPick={onPick} />)
    const start = container.querySelector<HTMLElement>('[tabindex="0"]')!
    start.focus()
    fireEvent.keyDown(start, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(1, 10)
    expect(getByRole('grid').contains(document.activeElement)).toBe(true)
  })

  it('outlines the peak only when one hour clearly stands out', () => {
    const a = render(<HeatmapGrid cells={cells} max={8} peak={{ dow: 1, hour: 10, value: 8 }} clear onPick={() => {}} />)
    expect(a.container.querySelectorAll('.peak')).toHaveLength(1)
    a.unmount()
    const b = render(<HeatmapGrid cells={cells} max={8} peak={{ dow: 1, hour: 10, value: 8 }} clear={false} onPick={() => {}} />)
    expect(b.container.querySelectorAll('.peak')).toHaveLength(0)
  })

  it('marks the chosen cell and outlines zero cells', () => {
    const { container } = render(<HeatmapGrid cells={cells} max={8} peak={null} clear={false} selected={{ dow: 2, hour: 3 }} onPick={() => {}} />)
    expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(1)
    expect(container.querySelectorAll('.zero').length).toBeGreaterThan(0)
  })
})

describe('heatColor', () => {
  it('is linear from heat-1 to heat-5 and uses heat-0 for zero', () => {
    expect(heatColor(0, 8)).toBe('var(--heat-0)')
    expect(heatColor(4, 8)).toBe('color-mix(in oklch, var(--heat-5) 50%, var(--heat-1))')
    expect(heatColor(8, 8)).toBe('color-mix(in oklch, var(--heat-5) 100%, var(--heat-1))')
  })
})
