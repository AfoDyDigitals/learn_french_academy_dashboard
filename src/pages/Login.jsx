import { useState } from 'react'
import { sb } from '../supabase'
import PasswordInput from '../PasswordInput'

// A reset link that expired or was already used lands here with an error in the URL
const linkExpired = /error_code=otp_expired|error=access_denied/.test(window.location.hash)

export default function Login() {
  const [mode, setMode] = useState(linkExpired ? 'forgot' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState(linkExpired ? 'That reset link has expired or was already used. Request a new one below.' : '')
  const [busy, setBusy] = useState(false)

  async function signIn(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) setMsg('Wrong email or password.')
    setBusy(false)
  }

  async function sendReset(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` })
    setBusy(false)
    // Same message whether or not the email has an account, so the form can't be used to find accounts
    setMsg(error?.status === 429 ? 'Too many requests. Wait a few minutes and try again.'
      : 'If that email has an account, a reset link is on its way. Check your inbox and spam folder.')
  }

  const switchTo = m => () => { setMode(m); setMsg(''); window.history.replaceState(null, '', '/') }

  return (
    <div className="login">
      {mode === 'signin' ? (
        <form className="panel" onSubmit={signIn}>
          <img src="/logo.png" alt="" height="64" />
          <h1>Tutor sign in</h1>
          <p className="sub">Learn French Academy</p>
          <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="pw">Password</label><PasswordInput id="pw" value={password} onChange={e => setPassword(e.target.value)} /></div>
          {msg && <p className="note">{msg}</p>}
          <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="link alt" onClick={switchTo('forgot')}>Forgot password?</button>
        </form>
      ) : (
        <form className="panel" onSubmit={sendReset}>
          <img src="/logo.png" alt="" height="64" />
          <h1>Reset password</h1>
          <p className="sub">Enter your email and we'll send you a link to set a new password.</p>
          <div className="field"><label htmlFor="fem">Email</label><input id="fem" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          {msg && <p className="note">{msg}</p>}
          <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          <button type="button" className="link alt" onClick={switchTo('signin')}>Back to sign in</button>
        </form>
      )}
    </div>
  )
}
