// SheetHost (plan F1-5): maps sheet.kind to a lazily loaded sheet. Each sheet reads the URL itself;
// once loaded it stays mounted so its close animation can play.
import { lazy, Suspense, useState, type ComponentType, type LazyExoticComponent } from 'react'
import type { Sheet } from '../state/url'
import { useUrlState } from '../state/useUrlState'

const SHEETS: Record<Sheet['kind'], LazyExoticComponent<ComponentType>> = {
  journey: lazy(() => import('../sheets/JourneySheet').then((m) => ({ default: m.JourneySheet }))),
  event: lazy(() => import('../sheets/EventSheet').then((m) => ({ default: m.EventSheet }))),
  row: lazy(() => import('../sheets/RowReportSheet').then((m) => ({ default: m.RowReportSheet }))),
  report: lazy(() => import('../sheets/FullReportSheet').then((m) => ({ default: m.FullReportSheet }))),
  dropoff: lazy(() => import('../sheets/DropoffSheet').then((m) => ({ default: m.DropoffSheet }))),
}

export function SheetHost() {
  const { sheet } = useUrlState()
  const [loaded, setLoaded] = useState<Sheet['kind'][]>([])
  if (sheet && !loaded.includes(sheet.kind)) setLoaded([...loaded, sheet.kind])
  return (
    <Suspense fallback={null}>
      {loaded.map((k) => {
        const C = SHEETS[k]
        return <C key={k} />
      })}
    </Suspense>
  )
}
