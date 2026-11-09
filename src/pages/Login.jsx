import { useState } from 'react'
import { sb } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) setMsg('Wrong email or password. Ask an admin to reset it if you forgot.')
    setBusy(false)
  }

  return (
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <img src="/logo.png" alt="" height="64" />
        <h1>Tutor sign in</h1>
        <p className="sub">Learn French Academy</p>
        <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
        {msg && <p className="note">{msg}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}
