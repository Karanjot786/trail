// FilterBar (plan F1-5): sticky inside the header. Chips plus "Clear all". Removing a chip focuses the next
// chip (or main after the last). Under a share link the chips are fixed.
import { useEffect, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { navigate, useUrlState } from '../state/useUrlState'
import { toast } from '../ui/toast'
import { DIM_LABEL, MONO_DIMS, valueLabel } from './labels'
import { setUi } from './uiStore'
import { announce } from './announce'

export function clearFilters(): void {
  navigate({ filters: [] })
  announce('All filters cleared. Press Back to restore them.')
  toast('Filters cleared', { kbd: 'Back', ms: 2200 })
}

export function FilterBar() {
  const s = useUrlState()
  const share = s.prefix.startsWith('/share/')
  const ref = useRef<HTMLDivElement>(null)
  const focusAfter = useRef<number | null>(null)

  useEffect(() => {
    const i = focusAfter.current
    if (i == null) return
    focusAfter.current = null
    const btns = ref.current?.querySelectorAll<HTMLButtonElement>('[data-rmf]')
    const next = btns?.[i] ?? null
    if (next) next.focus()
    else document.getElementById('main')?.focus()
  }, [s.filters])

  if (!s.filters.length || s.screen === 'settings') return null
  return (
    <div className="fbar" role="region" aria-label="Filters" ref={ref}>
      {s.filters.map((f, i) => {
        const label = DIM_LABEL[f.dim]
        const v = valueLabel(f.dim, f.value)
        return (
          <span key={`${f.dim}:${f.value}`} className="fpill" data-fixed={share ? '' : undefined}>
            <span className="t">
              <span className="k">{label}</span>
              <span className="op">is</span>
              <b className={MONO_DIMS.has(f.dim) ? 'mono' : undefined} title={v}>
                {v}
              </b>
            </span>
            {!share && (
              <button
                type="button"
                data-rmf={i}
                aria-label={`Remove filter ${label} is ${v}`}
                onClick={() => {
                  focusAfter.current = i
                  navigate({ filters: s.filters.filter((_, j) => j !== i) })
                  announce(`Filter removed: ${label} is ${v}. Press Back to undo.`)
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </span>
        )
      })}
      {!share && (
        <>
          <button type="button" className="clear" onClick={(e) => setUi({ palette: { scope: 'filter', instant: e.detail === 0 } })}>
            <Plus size={14} aria-hidden="true" />
            Filter
          </button>
          <button type="button" className="clear" onClick={clearFilters} aria-keyshortcuts="Shift+X">
            Clear all
          </button>
        </>
      )}
    </div>
  )
}
