// RangePicker (plan F1-5): presets in §0.3 order plus a custom range from two native date inputs.
// The custom form lives in its own popover (inputs inside a Radix menu would fight its typeahead).
import { useRef, useState, type FormEvent } from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { Popover as PP } from 'radix-ui'
import type { RangeKey } from '../api/types'
import { navigate, useUrlState } from '../state/useUrlState'
import { Menu, MenuItem, MenuLabel, MenuRadio, MenuRadioGroup, MenuSeparator } from '../ui/menu'
import { useLayer } from '../ui/layers'
import { Button } from '../ui/button'
import { RANGE_GROUPS, rangeLabel, tzCity } from './labels'
import { useStats } from './useStats'
import { useReportTz } from './useReportTz'
import { dayIso, todayIso } from '../lib/format'

export function RangePicker() {
  const s = useUrlState()
  const stats = useStats()
  const tz = useReportTz()
  const [custom, setCustom] = useState(false)
  // Opened once the menu has closed (see CompareMenu).
  const wantCustom = useRef(false)
  const afterMenu = (e: Event) => {
    if (!wantCustom.current) return
    wantCustom.current = false
    e.preventDefault()
    setCustom(true)
  }
  useLayer(custom, () => setCustom(false))
  const isCustom = s.range.startsWith('c:')
  const w = stats.data?.window
  const [long, short] = w && w.key === s.range && w.label ? [w.label, rangeLabel(s.range)[1]] : rangeLabel(s.range)
  const today = todayIso(tz)
  const [from0, to0] = isCustom ? s.range.slice(2).split('~') : [dayIso(Date.now() - 29 * 86_400_000, tz), today]
  const [from, setFrom] = useState(from0)
  const [to, setTo] = useState(to0)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!from || !to) return
    const [a, b] = from <= to ? [from, to] : [to, from]
    setCustom(false)
    navigate({ range: `c:${a}~${b}` as RangeKey })
  }

  const button = (
    <button type="button" className="btn range-btn">
      <Calendar size={14} aria-hidden="true" />
      <span className="rl">{long}</span>
      <span className="rs">{short}</span>
      <span className="sr-only">, date range</span>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
  )

  // A share link's range is part of the link: show it, offer no menu.
  if (s.prefix.startsWith('/share/'))
    return (
      <span className="btn range-btn" data-static="" role="group" aria-label={`Date range: ${long}`}>
        <Calendar size={14} aria-hidden="true" />
        <span className="rl" aria-hidden="true">{long}</span>
        <span className="rs" aria-hidden="true">{short}</span>
      </span>
    )

  return (
    <PP.Root open={custom} onOpenChange={setCustom}>
      <PP.Anchor asChild>
        <span style={{ display: 'inline-flex' }}>
          <Menu trigger={button} label="Date range" align="end" minWidth={260} onCloseAutoFocus={afterMenu}>
            <MenuRadioGroup value={s.range} onValueChange={(v) => navigate({ range: v as RangeKey })}>
              {RANGE_GROUPS.map((g) => (
                <div key={g.label} role="group" aria-label={g.label}>
                  <MenuLabel>{g.label}</MenuLabel>
                  {g.keys.map((k) => (
                    <MenuRadio key={k} value={k}>
                      {rangeLabel(k)[0]}
                    </MenuRadio>
                  ))}
                </div>
              ))}
            </MenuRadioGroup>
            <MenuSeparator />
            <MenuItem onSelect={() => (wantCustom.current = true)} end={isCustom ? long : undefined}>
              <span className="chk" aria-hidden="true" />
              Custom range…
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>{tzCity(tz)} time. Weeks start on Monday.</MenuLabel>
          </Menu>
        </span>
      </PP.Anchor>
      <PP.Portal>
        <PP.Content className="pop" role="dialog" aria-label="Custom range" align="end" sideOffset={6} collisionPadding={8}>
          <form className="pop-form" onSubmit={submit}>
            <div className="row2">
              <label>
                From
                <input className="input" type="date" required max={today} value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                To
                <input className="input" type="date" required max={today} value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            <Button type="submit" size="sm">
              Show this range
            </Button>
          </form>
        </PP.Content>
      </PP.Portal>
    </PP.Root>
  )
}
