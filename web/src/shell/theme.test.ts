import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, readTheme, setTheme } from './theme'

afterEach(() => {
  vi.restoreAllMocks()
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
  delete document.documentElement.dataset.theme
})

describe('theme', () => {
  it('defaults to dark with an empty localStorage', () => {
    applyTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(readTheme()).toBe('dark')
  })

  it('setTheme("light") applies it and persists trail.theme', () => {
    setTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('trail.theme')).toBe('light')
    applyTheme()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('a localStorage that throws still yields dark', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    applyTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(() => setTheme('light')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('ignores a junk stored value', () => {
    localStorage.setItem('trail.theme', 'purple')
    applyTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
