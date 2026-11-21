import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Globe } from './Globe'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Globe', () => {
  it('names the active countries it can place and toggles the spin', () => {
    render(<Globe points={[{ code: 'IN', n: 4 }, { code: 'US', n: 1 }, { code: 'ZZ', n: 2 }]} frozen={false} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Dot globe with 2 countries active: IN 4, US 1')
    fireEvent.click(screen.getByRole('button', { name: 'Pause globe' }))
    expect(screen.getByRole('button', { name: 'Spin globe' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('stays still with reduced motion and while frozen', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
    render(<Globe points={[]} frozen={false} />)
    expect(screen.getByRole('button', { name: 'Spin globe' })).toBeTruthy()
    cleanup()
    render(<Globe points={[]} frozen />)
    expect((screen.getByRole('button', { name: /globe/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
