// STUB (P0). F4 owns this file (plan §0.10): reads the URL's `dropoff` sheet; replace the body.
import { Sheet } from '../ui/dialog'
import { navigate, useUrlState } from '../state/useUrlState'

export function DropoffSheet() {
  const { sheet } = useUrlState()
  const open = sheet?.kind === 'dropoff'
  return (
    <Sheet open={open} onOpenChange={(o) => !o && navigate({ sheet: null })} title="Drop-off">
      {null}
    </Sheet>
  )
}
