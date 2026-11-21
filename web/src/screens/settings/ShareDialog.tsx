// STUB (P0). F5 owns this file (plan §0.10): reads the URL itself. Keep the props, replace the body.
import { Dialog } from '../../ui/dialog'

export function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Share a read-only link">
      {null}
    </Dialog>
  )
}
