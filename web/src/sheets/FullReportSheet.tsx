// STUB (P0). F2 owns this file (plan §0.10): reads the URL's `report` sheet; replace the body.
import { Sheet } from '../ui/dialog'
import { navigate, useUrlState } from '../state/useUrlState'

export function FullReportSheet() {
  const { sheet } = useUrlState()
  const open = sheet?.kind === 'report'
  return (
    <Sheet open={open} onOpenChange={(o) => !o && navigate({ sheet: null })} title="Full report">
      {null}
    </Sheet>
  )
}
