import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { BarRow } from './BarRow'

afterEach(cleanup)

describe('BarRow', () => {
  it('draws the bar at share × 100% width', () => {
    const { getByTestId } = render(<BarRow label="/docs/components" value="7" share={0.35} />)
    expect(getByTestId('bar').style.width).toBe('35%')
  })

  it('clamps the share to 0–100%', () => {
    const { getByTestId, rerender } = render(<BarRow label="a" value="1" share={1.4} />)
    expect(getByTestId('bar').style.width).toBe('100%')
    rerender(<BarRow label="a" value="1" share={-1} />)
    expect(getByTestId('bar').style.width).toBe('0%')
  })

  it('truncates a long label with an ellipsis and keeps the full text as a title', () => {
    const long = '/docs/components/a-very-long-path-that-will-not-fit-in-the-panel-width'
    const { getByText } = render(<BarRow label={long} value="3" share={0.1} />)
    const el = getByText(long)
    expect(el.className).toContain('truncate')
    expect(el.getAttribute('title')).toBe(long)
  })

  it('renders as a button when clickable', () => {
    const { getByRole } = render(<BarRow label="IN" value="58%" share={1} onClick={() => {}} />)
    expect(getByRole('button').textContent).toContain('IN')
  })
})
