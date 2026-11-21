// STUB (P0). F5 owns this file (plan §0.10): keep the props, replace the body.
import type { Site } from '../../api/types'
import { Dialog } from '../../ui/dialog'

export interface AddSiteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (site: Site) => void
}

export function AddSiteDialog({ open, onOpenChange }: AddSiteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Add website">
      {null}
    </Dialog>
  )
}
