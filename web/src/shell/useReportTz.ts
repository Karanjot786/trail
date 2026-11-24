// The zone reports are written in: the server's, named by `window.tz` in every stats response.
// Used for formatting only; API calls send no `tz` and the server picks its own zone.
import { useStats } from './useStats'

// The last zone a stats response named, so Settings and the first paint keep it without a request.
let lastTz = 'UTC'

export function useReportTz(): string {
  const tz = useStats().data?.window?.tz
  if (tz) lastTz = tz
  return tz || lastTz
}
