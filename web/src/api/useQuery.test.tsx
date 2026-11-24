import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { CACHE_MAX, invalidate, onGone, onUnauthorized, useQuery, type QueryOpts, type QueryResult } from './useQuery'
import { navigate } from '../state/useUrlState'
import { Gone, Unauthorized } from './client'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => invalidate())

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)))

function Probe<T>({ k, fn, poll, out, opts }: { k: string; fn: (s: AbortSignal) => Promise<T>; poll?: number; out: { r?: QueryResult<T> }; opts?: QueryOpts }) {
  out.r = useQuery(k, fn, { pollMs: poll, ...opts })
  return null
}

function setHidden(h: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useQuery', () => {
  it('a second mount within staleMs makes no fetch', async () => {
    const fn = vi.fn(async () => 42)
    const out: { r?: QueryResult<number> } = {}
    const a = render(<Probe k="stats" fn={fn} out={out} />)
    await flush()
    expect(out.r!.data).toBe(42)
    a.unmount()
    render(<Probe k="stats" fn={fn} out={out} />)
    await flush()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(out.r!.data).toBe(42)
  })

  it('polling stops while hidden and resumes on visible', async () => {
    vi.useFakeTimers()
    setHidden(false)
    const fn = vi.fn(async () => 1)
    render(<Probe k="live" fn={fn} poll={5000} out={{}} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fn).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(fn).toHaveBeenCalledTimes(2)
    act(() => setHidden(true))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000)
    })
    expect(fn).toHaveBeenCalledTimes(2)
    act(() => setHidden(false))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fn).toHaveBeenCalledTimes(3) // refetch on return
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(fn).toHaveBeenCalledTimes(4)
  })

  it('an error keeps the last data with error set', async () => {
    let fail = false
    const fn = vi.fn(async () => {
      if (fail) throw new Error('boom')
      return 'ok'
    })
    const out: { r?: QueryResult<string> } = {}
    render(<Probe k="series" fn={fn} out={out} />)
    await flush()
    expect(out.r!.data).toBe('ok')
    fail = true
    act(() => out.r!.refetch())
    await flush()
    expect(out.r!.data).toBe('ok')
    expect(out.r!.error?.message).toBe('boom')
  })

  it('keeps the previous data while a new key loads', async () => {
    const out: { r?: QueryResult<string> } = {}
    const r = render(<Probe k="a" fn={async () => 'A'} out={out} />)
    await flush()
    let resolve: (v: string) => void = () => {}
    r.rerender(<Probe k="b" fn={() => new Promise<string>((res) => (resolve = res))} out={out} />)
    expect(out.r!.data).toBe('A')
    expect(out.r!.loading).toBe(true)
    await act(async () => resolve('B'))
    expect(out.r!.data).toBe('B')
  })

  it('emits Unauthorized and Gone to their listeners', async () => {
    const u = vi.fn()
    const g = vi.fn()
    const off1 = onUnauthorized(u)
    const off2 = onGone(g)
    render(
      <>
        <Probe k="x1" fn={async () => Promise.reject(new Unauthorized())} out={{}} />
        <Probe k="x2" fn={async () => Promise.reject(new Gone())} out={{}} />
      </>,
    )
    await flush()
    expect(u).toHaveBeenCalled()
    expect(g).toHaveBeenCalled()
    off1()
    off2()
  })

  it("does not show the previous site's data after a site switch", async () => {
    history.replaceState(null, '', '/?site=a')
    const out: { r?: QueryResult<string> } = {}
    const r = render(<Probe k="k|a" fn={async () => 'A'} out={out} />)
    await flush()
    expect(out.r!.data).toBe('A')
    act(() => {
      navigate({ site: 'b' })
      r.rerender(<Probe k="k|b" fn={() => new Promise<string>(() => {})} out={out} />)
    })
    expect(out.r!.data).toBeUndefined()
    expect(out.r!.loading).toBe(true)
  })

  it("an error on a new key does not fall back to the previous key's data", async () => {
    history.replaceState(null, '', '/?site=a')
    const out: { r?: QueryResult<string> } = {}
    const r = render(<Probe k="x" fn={async () => 'X'} out={out} />)
    await flush()
    r.rerender(<Probe k="y" fn={async () => Promise.reject(new Error('boom'))} out={out} />)
    await flush()
    expect(out.r!.data).toBeUndefined()
    expect(out.r!.error?.message).toBe('boom')
  })

  it("keepPrevious:false drops the previous key's data while loading", async () => {
    history.replaceState(null, '', '/?site=a')
    const out: { r?: QueryResult<string> } = {}
    const r = render(<Probe k="a" fn={async () => 'A'} out={out} opts={{ keepPrevious: false }} />)
    await flush()
    r.rerender(<Probe k="b" fn={() => new Promise<string>(() => {})} out={out} opts={{ keepPrevious: false }} />)
    expect(out.r!.data).toBeUndefined()
    expect(out.r!.loading).toBe(true)
  })

  it('evicts the oldest entries beyond CACHE_MAX', async () => {
    const fn = vi.fn(async () => 1)
    for (let i = 0; i <= CACHE_MAX; i++) {
      const u = render(<Probe k={`ev${i}`} fn={fn} out={{}} />)
      await flush()
      u.unmount()
    }
    expect(fn).toHaveBeenCalledTimes(CACHE_MAX + 1)
    render(<Probe k="ev0" fn={fn} out={{}} />)
    await flush()
    expect(fn).toHaveBeenCalledTimes(CACHE_MAX + 2)
    render(<Probe k={`ev${CACHE_MAX}`} fn={fn} out={{}} />)
    await flush()
    expect(fn).toHaveBeenCalledTimes(CACHE_MAX + 2)
  })
})
