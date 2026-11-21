// The password gate (plan F1-7), moved from components/Login.tsx onto the new primitives.
import { useState } from 'react'
import { api } from '../api/client'
import { Button } from '../ui/button'
import { Mark } from './Mark'

export function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <main className="center-screen">
      <form
        className="login"
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
        <span className="switcher" data-static="" style={{ padding: 0 }}>
          <span className="mark">
            <Mark />
          </span>
        </span>
        <h1>Trail</h1>
        <p className="muted">Enter the dashboard password.</p>
        <label htmlFor="pw" className="muted">
          Password
        </label>
        <input
          id="pw"
          className="input"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          aria-invalid={!!err}
          aria-describedby={err ? 'pw-err' : undefined}
        />
        {err && (
          <p id="pw-err" className="err" role="alert">
            {err}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </main>
  )
}
