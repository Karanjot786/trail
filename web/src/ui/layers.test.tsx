import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useLayer } from './layers'

afterEach(cleanup)

function L({ open, close }: { open: boolean; close: () => void }) {
  useLayer(open, close)
  return null
}
const esc = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

describe('useLayer', () => {
  it('with two layers open, one Esc closes only the top one', () => {
    const a = vi.fn()
    const b = vi.fn()
    render(
      <>
        <L open close={a} />
        <L open close={b} />
      </>,
    )
    esc()
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).not.toHaveBeenCalled()
  })

  it('a closed layer is not on the stack', () => {
    const a = vi.fn()
    const b = vi.fn()
    render(
      <>
        <L open close={a} />
        <L open={false} close={b} />
      </>,
    )
    esc()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
  })
})
