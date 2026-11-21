import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import type { Basis } from '../api/types'
import { DeltaPill } from './delta-pill'
import { Menu, MenuCheckbox } from './menu'
import { Dialog } from './dialog'
import { InfoHint } from './tooltip'
import { Avatar, avatarCells } from './avatar'
import { Tabs } from './tabs'
import { Kbd } from './small'

afterEach(cleanup)

const basis: Basis = { text: 'vs Wed, Nov 11 (the day before)', short: 'Nov 11', why: '', dates: 'Nov 11', custom: false, none: false }

describe('DeltaPill', () => {
  it('renders +86% with sr text that carries the basis', () => {
    const { container } = render(<DeltaPill cur={41} prev={22} kind="count" goodWhen="up" basis={basis} />)
    expect(container.textContent).toContain('+86%')
    expect(container.querySelector('.sr-only')!.textContent).toBe('up 86% vs Wed, Nov 11 (the day before)')
    expect(container.querySelector('.delta')!.getAttribute('data-tone')).toBe('good')
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('a low delta reads "too little data" with no arrow', () => {
    const { container } = render(<DeltaPill cur={0.45} prev={0.4} kind="rate" goodWhen="down" n={3} basis={basis} />)
    expect(container.querySelector('[aria-hidden="true"]:not(svg)')!.textContent).toBe('too little data')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('a money zero reads "no purchases" without the bad tone', () => {
    const { container } = render(<DeltaPill cur={0} prev={4000} kind="money" goodWhen="up" basis={basis} />)
    expect(container.textContent).toContain('no purchases')
    expect(container.querySelector('.delta')!.getAttribute('data-tone')).not.toBe('bad')
  })
})

describe('MenuCheckbox', () => {
  it('cannot be unticked when disabled', async () => {
    const change = vi.fn()
    render(
      <Menu trigger={<button type="button">Columns</button>} label="Columns" open onOpenChange={() => {}}>
        <MenuCheckbox checked disabled onCheckedChange={change}>
          Visitors
        </MenuCheckbox>
      </Menu>,
    )
    const item = await screen.findByRole('menuitemcheckbox', { name: 'Visitors' })
    expect(item.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(item)
    fireEvent.keyDown(item, { key: 'Enter' })
    expect(change).not.toHaveBeenCalled()
  })
})

describe('Dialog', () => {
  it('returns focus to the trigger on close', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Dialog open={open} onOpenChange={setOpen} title="Share a read-only link">
            <p>Body</p>
          </Dialog>
        </>
      )
    }
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    trigger.focus()
    fireEvent.click(trigger)
    const dlg = await screen.findByRole('dialog', { name: 'Share a read-only link' })
    expect(dlg).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('InfoHint', () => {
  it('opens on focus', async () => {
    render(<InfoHint label="Bounce rate">Sessions with one page and under 10 s.</InfoHint>)
    const btn = screen.getByRole('button', { name: 'Bounce rate' })
    act(() => btn.focus())
    expect((await screen.findByRole('tooltip')).textContent).toContain('one page')
  })

  it('opens on tap and closes on a second tap', async () => {
    render(<InfoHint label="Sessions">A visit ends after 30 minutes idle.</InfoHint>)
    const btn = screen.getByRole('button', { name: 'Sessions' })
    fireEvent.click(btn)
    expect(await screen.findByRole('tooltip')).toBeTruthy()
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(btn)
    await act(() => new Promise((r) => setTimeout(r, 20)))
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('Avatar', () => {
  it('is deterministic for a seed', () => {
    const a = render(<Avatar seed="p_3b49" />).container.innerHTML
    cleanup()
    const b = render(<Avatar seed="p_3b49" />).container.innerHTML
    expect(a).toBe(b)
    expect(avatarCells('p_3b49')).toEqual(avatarCells('p_3b49'))
  })

  it('is mirrored and never empty', () => {
    for (const s of ['a', 'b', 'visitor-42', '']) {
      const c = avatarCells(s)
      expect(c.some(Boolean)).toBe(true)
      for (let r = 0; r < 3; r++) expect(c[r * 3]).toBe(c[r * 3 + 2])
    }
  })
})

describe('Tabs', () => {
  it('arrow keys move the selection', () => {
    const change = vi.fn()
    render(<Tabs value="a" onValueChange={change} ariaLabel="T" items={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B', count: 3 }]} />)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'A' }), { key: 'ArrowRight' })
    expect(change).toHaveBeenCalledWith('b')
  })
})

describe('Kbd', () => {
  it('splits keys on spaces', () => {
    const { container } = render(<Kbd>G V</Kbd>)
    expect(container.querySelectorAll('kbd')).toHaveLength(2)
  })
})
