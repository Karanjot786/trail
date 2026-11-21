import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { shellShortcuts, useShortcuts, type ShellActions } from './shortcuts'
import { useLayer } from '../ui/layers'
import { current, navigate, startRouter } from './router'

afterEach(cleanup)
beforeEach(() => {
  history.replaceState(null, '', '/?site=demo&f=country:IN')
  startRouter()
})

const key = (k: string, o: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }))

function actions(over: Partial<ShellActions> = {}): ShellActions {
  return {
    share: false,
    screen: 'overview',
    hasFilters: current().filters.length > 0,
    hasRevenue: true,
    journeyOpen: false,
    go: (screen) => navigate({ screen }),
    palette: vi.fn(),
    saveView: vi.fn(),
    shortcuts: vi.fn(),
    toggleRail: vi.fn(),
    visit: vi.fn(),
    metric: (metric) => navigate({ metric }),
    clearFilters: () => navigate({ filters: [] }),
    toggleTheme: vi.fn(),
    ...over,
  }
}

function Harness({ a, layer }: { a: ShellActions; layer?: () => void }) {
  useShortcuts(shellShortcuts(a))
  useLayer(!!layer, layer ?? (() => {}))
  return null
}

describe('shortcuts', () => {
  it('Esc with no layer leaves the URL filters unchanged', () => {
    render(<Harness a={actions()} />)
    key('Escape')
    expect(current().filters).toEqual([{ dim: 'country', value: 'IN' }])
  })

  it('Esc on an open layer closes it and keeps the filters', () => {
    const close = vi.fn()
    render(<Harness a={actions()} layer={close} />)
    key('Escape')
    expect(close).toHaveBeenCalledTimes(1)
    expect(current().filters).toHaveLength(1)
  })

  it('G then V within 1 s goes to /activity/visitors', () => {
    render(<Harness a={actions()} />)
    key('g')
    key('v')
    expect(location.pathname).toBe('/activity/visitors')
  })

  it('Shift+X clears the filters', () => {
    render(<Harness a={actions()} />)
    key('X', { shiftKey: true })
    expect(current().filters).toEqual([])
  })

  it('F in share mode does nothing', () => {
    const a = actions({ share: true })
    render(<Harness a={a} />)
    key('f')
    key('s')
    key('X', { shiftKey: true })
    expect(a.palette).not.toHaveBeenCalled()
    expect(a.saveView).not.toHaveBeenCalled()
    expect(current().filters).toHaveLength(1)
  })

  it('F opens the palette scoped to filters; typing in an input is ignored', () => {
    const a = actions()
    render(
      <>
        <Harness a={a} />
        <input aria-label="x" />
      </>,
    )
    document.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    expect(a.palette).not.toHaveBeenCalled()
    key('f')
    expect(a.palette).toHaveBeenCalledWith('filter')
  })

  it('2 picks the page views metric on the overview', () => {
    render(<Harness a={actions()} />)
    key('2')
    expect(current().metric).toBe('pageviews')
  })
})
