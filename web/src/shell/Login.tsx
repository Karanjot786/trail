// The password gate. The server keeps the security (a delay on a wrong password, an HttpOnly SameSite=Strict
// cookie); this screen tells a wrong password apart from a server it cannot reach, and says where the password lives.
import { useId, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { api, HttpError } from '../api/client'
import { Button } from '../ui/button'
import { Mark } from './Mark'

export const DOCS_FIRST_RUN = 'https://trail.karanjot.dev/docs/dashboard/first-run#where-is-my-password'

export type LoginError = 'wrong' | 'unreachable' | 'busy' | 'other'

/** What went wrong, from the login call's result: false is a 401; a thrown fetch error means no server answered. */
export function loginError(r: { ok: boolean } | { error: unknown }): LoginError | null {
  if ('ok' in r) return r.ok ? null : 'wrong'
  const e = r.error
  if (e instanceof HttpError) {
    if (e.status === 429) return 'busy'
    if (e.status >= 500) return 'unreachable' // a proxy in front of a stopped server answers 502/503/504
    return 'other'
  }
  return 'unreachable'
}

const MESSAGE: Record<LoginError, string> = {
  wrong: 'That password is not right. Check for typos and try again.',
  unreachable: 'Can’t reach the Trail server. Check that it is running, then try again.',
  busy: 'Too many attempts. Wait a minute, then try again.',
  other: 'Signing in failed. Reload the page and try again.',
}

export function Login({ onDone }: { onDone: () => void }) {
  const uid = useId()
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState<LoginError | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const errId = `${uid}-err`

  const submit = async () => {
    if (busy) return
    if (!pw) {
      input.current?.focus()
      return
    }
    setBusy(true)
    setErr(null)
    const e = loginError(await api.login(pw).then((ok) => ({ ok }), (error: unknown) => ({ error })))
    setBusy(false)
    if (!e) return onDone()
    setErr(e)
    input.current?.focus()
    if (e === 'wrong') input.current?.select()
  }

  return (
    <main className="center-screen auth">
      <form
        className="login"
        noValidate
        aria-labelledby={`${uid}-h`}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <span className="auth-mark auth-mark-lg" aria-hidden="true">
          <Mark />
        </span>
        <div className="login-head">
          <h1 id={`${uid}-h`}>Sign in to Trail</h1>
          <p className="muted">Enter the dashboard password for this server.</p>
        </div>
        <div className="login-field">
          <label htmlFor={`${uid}-pw`}>Password</label>
          <div className="pw-wrap">
            <input
              ref={input}
              id={`${uid}-pw`}
              name="password"
              className="input"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              value={pw}
              onChange={(e) => {
                setPw(e.target.value)
                if (err === 'wrong') setErr(null)
              }}
              aria-invalid={err === 'wrong' ? true : undefined}
              aria-describedby={err ? errId : undefined}
            />
            <button
              type="button"
              className="icon-btn pw-eye"
              data-size="sm"
              aria-label="Show password"
              aria-pressed={show}
              aria-controls={`${uid}-pw`}
              onClick={() => {
                setShow((v) => !v)
                input.current?.focus()
              }}
            >
              {show ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
          <p id={errId} className="login-err" role="alert">
            {err ? MESSAGE[err] : ''}
          </p>
        </div>
        <Button type="submit" variant="primary" className="login-go" disabled={busy} aria-busy={busy || undefined}>
          <span className="login-go-l" data-on={busy ? undefined : ''}>
            Sign in
          </span>
          <span className="login-go-l" data-on={busy ? '' : undefined} aria-hidden={!busy}>
            <span className="spin" aria-hidden="true" />
            Signing in…
          </span>
        </Button>
        <details className="login-help">
          <summary>Where’s my password?</summary>
          <div className="login-help-b">
            <p>
              It is the <code className="inl">TRAIL_PASSWORD</code> the server was started with: in your <code className="inl">docker run</code> command, your{' '}
              <code className="inl">.env</code> file or your host’s environment variables.
            </p>
            <p>
              Started Trail without one? The first run creates a password and prints it in the server log. Run <code className="inl">docker logs trail</code>, or look in the
              terminal where Trail runs.
            </p>
            <p>
              Lost it? Set a new <code className="inl">TRAIL_PASSWORD</code> and restart the server. Your data stays.{' '}
              <a href={DOCS_FIRST_RUN} target="_blank" rel="noreferrer">
                Read the guide
              </a>
            </p>
          </div>
        </details>
      </form>
    </main>
  )
}
