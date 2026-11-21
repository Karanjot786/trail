import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../api/client', async (orig) => {
  const real = await orig<typeof import('../../api/client')>()
  const { activityApi } = await import('../activity/testdata')
  return { ...real, api: activityApi() }
})

import { api } from '../../api/client'
import { invalidate } from '../../api/useQuery'
import { current, startRouter } from '../../shell/router'
import { live, state } from '../activity/testdata'
import LiveScreen, { POLL_MS, streamCopy } from './index'

const liveFn = (api as unknown as { live: ReturnType<typeof vi.fn> }).live
function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
const setHidden = (v: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => v })
  document.dispatchEvent(new Event('visibilitychange'))
}
const setOnline = (v: boolean) => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v })
  window.dispatchEvent(new Event(v ? 'online' : 'offline'))
}

beforeEach(() => {
  invalidate()
  liveFn.mockClear()
  state.live = live()
  setHidden(false)
  setOnline(true)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Live', () => {
  it('polls every 5 s and stops while the tab is hidden', async () => {
    vi.useFakeTimers()
    visit('/live?site=demo')
    render(<LiveScreen />)
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)))
    expect(liveFn).toHaveBeenCalledTimes(1)
    await act(async () => void (await vi.advanceTimersByTimeAsync(POLL_MS)))
    expect(liveFn).toHaveBeenCalledTimes(2)
    await act(async () => void (await vi.advanceTimersByTimeAsync(POLL_MS)))
    expect(liveFn).toHaveBeenCalledTimes(3)
    act(() => setHidden(true))
    await act(async () => void (await vi.advanceTimersByTimeAsync(POLL_MS * 3)))
    expect(liveFn).toHaveBeenCalledTimes(3)
    expect(screen.getByTestId('live-active').textContent).toBe('6')
  })

  it('Pause stops polling', async () => {
    vi.useFakeTimers()
    visit('/live?site=demo')
    render(<LiveScreen />)
    await act(async () => void (await vi.advanceTimersByTimeAsync(10)))
    fireEvent.click(screen.getByRole('button', { name: 'Pause updates' }))
    const n = liveFn.mock.calls.length
    await act(async () => void (await vi.advanceTimersByTimeAsync(POLL_MS * 3)))
    expect(liveFn.mock.calls.length).toBe(n)
    expect(screen.getByRole('button', { name: 'Resume' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('offline: "as of", "paused while offline", Pause disabled, grey dots', async () => {
    visit('/live?site=demo')
    render(<LiveScreen />)
    await screen.findByTestId('live-active')
    act(() => setOnline(false))
    expect(screen.getByTestId('live-updated').textContent).toMatch(/as of \d\d:\d\d, not updating/)
    expect(screen.getByText(/paused while offline, as of \d\d:\d\d/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Pause updates' }) as HTMLButtonElement).disabled).toBe(true)
    const dots = document.querySelectorAll('.sdot')
    expect(dots.length).toBeGreaterThan(0)
    dots.forEach((d) => expect(d.getAttribute('data-tone')).toBe('off'))
  })

  it('equal counts give identical bars, all in one grid column', async () => {
    visit('/live?site=demo')
    render(<LiveScreen />)
    const region = await screen.findByRole('region', { name: 'Countries' })
    const bars = Array.from(region.querySelectorAll<HTMLElement>('[data-bar]'))
    expect(bars.map((b) => b.style.transform)).toEqual(['scaleX(1)', 'scaleX(1)', `scaleX(${1 / 3})`])
    expect(new Set(bars.map((b) => b.parentElement!.className)).size).toBe(1)
  })

  it('labels and the stream copy; a stream row opens the journey', async () => {
    visit('/live?site=demo')
    render(<LiveScreen />)
    await screen.findByTestId('live-active')
    for (const l of ['Visitors now', 'Events, last 5 min', 'Countries now', 'Pages open now']) expect(screen.getAllByText(l).length).toBeGreaterThan(0)
    expect(screen.getByTestId('live-stream-copy').textContent).toMatch(/^All 1 event from the last 5 minutes/)
    fireEvent.click(within(screen.getByRole('region', { name: 'Live events' })).getByRole('button', { name: /e2e-test-visit/ }))
    expect(current().sheet).toEqual({ kind: 'journey', person: 'p1', session: 's1' })
  })

  it('stream copy says "The latest 50" past the cap', () => {
    expect(streamCopy(50, 212)).toBe('The latest 50')
    expect(streamCopy(3, 3)).toBe('All 3 events')
  })
})
