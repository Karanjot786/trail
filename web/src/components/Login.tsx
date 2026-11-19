import { useState } from 'react'
import { LoaderIcon } from 'lucide-react'
import { api } from '@/api'

export function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-6"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setErr('')
          const ok = await api.login(pw).catch(() => false)
          setBusy(false)
          if (ok) onDone()
          else setErr('Wrong password.')
        }}
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">Trail</h1>
          <p className="text-sm text-muted">Enter the dashboard password.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pw" className="text-sm text-muted">
            Password
          </label>
          <input
            id="pw"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            aria-invalid={!!err}
            aria-describedby={err ? 'pw-err' : undefined}
            className="h-10 rounded-lg border border-border bg-black px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-bad"
          />
          {err && (
            <p id="pw-err" className="text-sm text-bad">
              {err}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="pressable flex h-10 items-center justify-center gap-2 rounded-lg bg-fg text-[15px] font-medium text-black hover:bg-white disabled:opacity-60"
        >
          {busy && <LoaderIcon className="size-4 animate-spin" />}
          Log in
        </button>
      </form>
    </main>
  )
}
