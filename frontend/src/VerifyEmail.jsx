import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, CircleNotch, WarningCircle } from '@phosphor-icons/react'
import { api } from './api'
import { AuthShell, ResendButton } from './Auth'
import { takeSignupReturn } from './signup-return'

const inFlight = new Map()
const verifyOnce = (token) => {
  if (!inFlight.has(token)) {
    inFlight.set(token, api('/auth/verify-email', { method: 'POST', body: { token }, authenticated: false })
      .finally(() => inFlight.delete(token)))
  }
  return inFlight.get(token)
}

export default function VerifyEmail({ onAuth }) {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const [state, setState] = useState(() => (token ? { status: 'verifying' } : { status: 'error', code: 'invalid', message: 'This verification link is incomplete. Request a new one below.' }))
  const [email, setEmail] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!token) return
    let active = true
    let redirect
    verifyOnce(token)
      .then((result) => {
        if (!active) return
        setState({ status: 'done' })
        onAuth(result, true)
        const next = takeSignupReturn(result.user?.email)
        redirect = setTimeout(() => navigate(next, { replace: true }), 1200)
      })
      .catch((err) => {
        if (!active) return
        const retryable = !err.status || err.status === 429 || err.status >= 500
        setState(retryable
          ? { status: 'unavailable', message: 'Email verification is temporarily unavailable. Please try again.' }
          : { status: 'error', code: err.code ?? 'invalid', message: err.message })
        if (err.data?.email) setEmail(err.data.email)
      })
    return () => { active = false; clearTimeout(redirect) }
  }, [token, onAuth, navigate, retryCount])

  return (
    <AuthShell>
      <section className="auth-form auth-card-center" aria-live="polite">
        {state.status === 'verifying' && (
          <>
            <span className="auth-big-icon"><CircleNotch size={30} className="spin" /></span>
            <header className="auth-head"><h1>Confirming your email…</h1><p>This only takes a moment.</p></header>
          </>
        )}

        {state.status === 'done' && (
          <>
            <span className="auth-big-icon ok"><CheckCircle size={30} weight="duotone" /></span>
            <header className="auth-head"><h1>Email confirmed</h1><p>Your account is active. Taking you to your feed…</p></header>
          </>
        )}

        {state.status === 'unavailable' && (
          <>
            <header className="auth-head"><h1>Could not confirm your email</h1><p>{state.message}</p></header>
            <button type="button" className="btn btn-primary btn-block" onClick={() => {
              setState({ status: 'verifying' })
              setRetryCount((count) => count + 1)
            }}>Retry verification</button>
          </>
        )}

        {state.status === 'error' && state.code === 'already_verified' && (
          <>
            <span className="auth-big-icon ok"><CheckCircle size={30} weight="duotone" /></span>
            <header className="auth-head"><h1>Already confirmed</h1><p>{state.message}</p></header>
            <Link to="/login" className="btn btn-primary btn-block auth-submit">Log in</Link>
          </>
        )}

        {state.status === 'error' && state.code !== 'already_verified' && (
          <>
            <span className="auth-big-icon warn"><WarningCircle size={30} weight="duotone" /></span>
            <header className="auth-head">
              <h1>{state.code === 'expired' ? 'Link expired' : 'Link not valid'}</h1>
              <p>{state.message}</p>
            </header>
            <div className="field">
              <label htmlFor="resend-email">Email you signed up with</label>
              <input id="resend-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@university.edu" />
            </div>
            <ResendButton email={email.trim()} />
            <p className="auth-fineprint">Already confirmed? <Link to="/login">Log in</Link></p>
          </>
        )}
      </section>
    </AuthShell>
  )
}
