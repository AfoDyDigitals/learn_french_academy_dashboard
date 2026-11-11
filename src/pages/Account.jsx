import { useState } from 'react'
import { sb } from '../supabase'
import { PageHeader } from '../components'
import PasswordInput from '../PasswordInput'

const empty = { current: '', next: '', repeat: '' }

export default function Account({ email }) {
  const [f, setF] = useState(empty)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const set = k => e => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault(); setMsg('')
    if (f.next !== f.repeat) return setMsg("The two new passwords don't match.")
    if (f.next === f.current) return setMsg('The new password must be different from the current one.')
    setBusy(true)
    // Confirm the current password before changing it
    const check = await sb.auth.signInWithPassword({ email, password: f.current })
    if (check.error) { setBusy(false); return setMsg('Your current password is wrong.') }
    const { error } = await sb.auth.updateUser({ password: f.next })
    setBusy(false)
    if (error) return setMsg(`Not changed: ${error.message}`)
    setF(empty); setMsg('Password changed.')
  }

  return (
    <section>
      <PageHeader title="Account" sub={email} />
      <form className="panel form narrow" onSubmit={submit}>
        <h2>Change password</h2>
        <div className="field"><label htmlFor="cp">Current password</label><PasswordInput id="cp" value={f.current} onChange={set('current')} /></div>
        <div className="field"><label htmlFor="np">New password (at least 8 characters)</label><PasswordInput id="np" autoComplete="new-password" minLength={8} value={f.next} onChange={set('next')} /></div>
        <div className="field"><label htmlFor="rp">Repeat new password</label><PasswordInput id="rp" autoComplete="new-password" minLength={8} value={f.repeat} onChange={set('repeat')} /></div>
        {msg && <p className="note">{msg}</p>}
        <div className="form-actions"><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button></div>
      </form>
    </section>
  )
}
