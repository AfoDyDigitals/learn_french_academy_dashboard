import { useState } from 'react'
import { sb } from '../supabase'
import PasswordInput from '../PasswordInput'

// Shown after a tutor opens the reset link from their email
export default function SetPassword({ onDone }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault(); setMsg('')
    if (pw !== pw2) return setMsg("The two passwords don't match.")
    setBusy(true)
    const { error } = await sb.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setMsg(`Not changed: ${error.message}`)
    window.history.replaceState(null, '', '/')
    onDone()
  }

  return (
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <img src="/logo.png" alt="" height="64" />
        <h1>Set a new password</h1>
        <p className="sub">At least 8 characters.</p>
        <div className="field"><label htmlFor="np">New password</label><PasswordInput id="np" autoComplete="new-password" minLength={8} value={pw} onChange={e => setPw(e.target.value)} /></div>
        <div className="field"><label htmlFor="np2">Repeat new password</label><PasswordInput id="np2" autoComplete="new-password" minLength={8} value={pw2} onChange={e => setPw2(e.target.value)} /></div>
        {msg && <p className="note">{msg}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save password and continue'}</button>
      </form>
    </div>
  )
}
