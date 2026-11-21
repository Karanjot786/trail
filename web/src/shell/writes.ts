// Shared handling for writes from the shell: the demo is read-only; anything else gets a plain message.
import { HttpError } from '../api/client'
import { reportError } from '../api/useQuery'
import { toast } from '../ui/toast'

export function writeFailed(e: unknown): void {
  reportError(e)
  if (e instanceof HttpError && e.status === 403) toast('The demo is read-only', { tone: 'info' })
  else toast(e instanceof Error && e.message ? e.message : 'That did not save. Try again.', { tone: 'bad' })
}
