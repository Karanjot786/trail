// STUB (P0). F3 owns this file (plan §0.10): reads the URL's `event` sheet; replace the body.
import { Sheet } from '../ui/dialog'
import { navigate, useUrlState } from '../state/useUrlState'

export function EventSheet() {
  const { sheet } = useUrlState()
  const open = sheet?.kind === 'event'
  return (
    <Sheet open={open} onOpenChange={(o) => !o && navigate({ sheet: null })} title="Event">
      {null}
    </Sheet>
  )
}
