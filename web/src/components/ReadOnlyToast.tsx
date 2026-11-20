import { useEffect, useState } from 'react'
import { LockIcon } from 'lucide-react'
import { onReadOnly } from '@/api'

/** Demo-only toast for refused writes. Always mounted (a live region), so showing it moves nothing. */
export function ReadOnlyToast() {
  const [shown, setShown] = useState(false)
  // The text stays after the first show so the pill fades out with its words, not empty.
  const [text, setText] = useState('')
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const off = onReadOnly(() => {
      setShown(true)
      setText('The demo is read-only')
      clearTimeout(t)
      t = setTimeout(() => setShown(false), 2600)
    })
    return () => {
      off()
      clearTimeout(t)
    }
  }, [])
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        data-shown={shown || undefined}
        className="toast flex items-center gap-2 rounded-full border border-border-strong bg-card px-4 py-2 text-sm text-fg shadow-[0_8px_30px_rgb(0_0_0/0.6)]"
      >
        <LockIcon className="size-4 text-muted" strokeWidth={1.75} aria-hidden />
        {text}
      </div>
    </div>
  )
}
