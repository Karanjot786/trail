// CompareMenu (plan F1-5): Previous period, Custom period…, No comparison. The basis text comes from the server window.
import { useState, type FormEvent } from 'react'
import { ChevronDown, GitCompareArrows } from 'lucide-react'
import { Popover as PP } from 'radix-ui'
import type { CmpKey } from '../api/types'
import { navigate, useUrlState } from '../state/useUrlState'
import { Menu, MenuLabel, MenuRadio, MenuRadioGroup, MenuSeparator } from '../ui/menu'
import { useLayer } from '../ui/layers'
import { Button } from '../ui/button'
import { rangeDays } from './router'
import { useStats } from './useStats'

export function CompareMenu() {
  const s = useUrlState()
  const stats = useStats()
  const [custom, setCustom] = useState(false)
  useLayer(custom, () => setCustom(false))
  const basis = stats.data?.window?.basis?.text ? stats.data.window.basis : undefined
  const mode = s.cmp === 'none' ? 'none' : s.cmp.startsWith('c:') ? 'custom' : 'prev'
  const label = mode === 'none' ? 'Compare' : basis ? (basis.none ? 'No earlier data' : `vs ${basis.short}`) : 'vs previous period'
  const days = rangeDays(s.range)
  const [start, setStart] = useState(s.cmp.startsWith('c:') ? s.cmp.slice(2) : '')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!start) return
    setCustom(false)
    navigate({ cmp: `c:${start}` as CmpKey })
  }

  const button = (
    <button type="button" className="btn" aria-label="Compare with" aria-pressed={mode !== 'none'} title={basis && mode !== 'none' ? basis.text : undefined}>
      <GitCompareArrows size={14} aria-hidden="true" />
      <span className="lbl-hide" aria-hidden="true">
        {label}
      </span>
      <span className="sr-only">{mode === 'none' ? ': off' : basis ? `: ${basis.text}` : ''}</span>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
  )
  return (
    <PP.Root open={custom} onOpenChange={setCustom}>
      <PP.Anchor asChild>
        <span style={{ display: 'inline-flex' }}>
          <Menu trigger={button} label="Compare with" align="end" minWidth={300}>
            <MenuLabel>Compare with</MenuLabel>
            <MenuRadioGroup value={mode} onValueChange={(v) => (v === 'custom' ? undefined : navigate({ cmp: v as CmpKey }))}>
              <MenuRadio value="prev" end={mode === 'prev' && basis && !basis.none ? basis.dates : undefined}>
                Previous period
              </MenuRadio>
              <MenuRadio value="custom" end={mode === 'custom' && basis ? basis.dates : undefined} onSelect={() => setTimeout(() => setCustom(true), 0)}>
                Custom period…
              </MenuRadio>
              <MenuRadio value="none">No comparison</MenuRadio>
            </MenuRadioGroup>
            <MenuSeparator />
            <MenuLabel>One day is always compared with the day before; today with the same hours of yesterday.</MenuLabel>
          </Menu>
        </span>
      </PP.Anchor>
      <PP.Portal>
        <PP.Content className="pop" role="dialog" aria-label="Custom comparison period" align="end" sideOffset={6} collisionPadding={8}>
          <form className="pop-form" onSubmit={submit}>
            <label>
              Compare with the {days} {days === 1 ? 'day' : 'days'} starting
              <input className="input" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <Button type="submit" size="sm">
              Compare
            </Button>
          </form>
        </PP.Content>
      </PP.Portal>
    </PP.Root>
  )
}
