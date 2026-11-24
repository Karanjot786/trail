import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../api/client', async (orig) => {
  const real = await orig<typeof import('../api/client')>()
  const { apiMock } = await import('./testkit')
  return { ...real, api: apiMock() }
})

import { RangePicker } from './RangePicker'
import { startRouter, navigate } from './router'
import { invalidate } from '../api/useQuery'

function visit(url: string) {
  history.replaceState(null, '', url)
  startRouter()
}
const flush = () => act(() => new Promise((r) => setTimeout(r, 20)))

async function openCustom() {
  const btn = screen.getByRole('button', { name: /date range/i })
  btn.focus()
  fireEvent.keyDown(btn, { key: 'Enter' })
  await flush()
  fireEvent.click(await screen.findByRole('menuitem', { name: /Custom range/ }))
  await flush()
  return screen.findByRole('dialog', { name: 'Custom range' })
}

beforeEach(() => invalidate())
afterEach(cleanup)

describe('RangePicker', () => {
  it('custom range opens on the current custom dates', async () => {
    visit('/?site=demo&range=c:2026-01-01~2026-01-10')
    render(<RangePicker />)
    await flush()
    act(() => navigate({ range: 'c:2026-02-01~2026-02-05' as never }))
    await flush()
    const dlg = await openCustom()
    const inputs = dlg.querySelectorAll('input[type=date]')
    expect([...inputs].map((i) => (i as HTMLInputElement).value)).toEqual(['2026-02-01', '2026-02-05'])
  })
})
