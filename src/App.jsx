import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { sb } from './supabase'
import Login from './pages/Login'
import Today from './pages/Today'
import Library from './pages/Library'
import Classes from './pages/Classes'
import Students from './pages/Students'
import Report from './pages/Report'
import Admin from './pages/Admin'
import Account from './pages/Account'
import SetPassword from './pages/SetPassword'
import { enablePush, pushEnabled } from './push'

const nav = [['/', 'Today'], ['/library', 'Library'], ['/classes', 'Classes'], ['/students', 'Students'], ['/report', 'Class report']]

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [menu, setMenu] = useState(false) // mobile menu open
  const { pathname } = useLocation()
  const [push, setPush] = useState(null) // null = unknown, true = on, string = message
  // True after opening a password reset link from email
  const [recovery, setRecovery] = useState(() => window.location.hash.includes('type=recovery'))

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((e, s) => { setSession(s); if (e === 'PASSWORD_RECOVERY') setRecovery(true) })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return setProfile(null)
    sb.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => setProfile(data))
  }, [session])

  useEffect(() => setMenu(false), [pathname]) // close menu after navigating
  useEffect(() => {
    const esc = e => e.key === 'Escape' && setMenu(false)
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [])

  useEffect(() => { if (session) pushEnabled().then(on => on && setPush(true)) }, [session])

  if (session === undefined) return null
  if (!session) return <Login />
  if (recovery) return <SetPassword onDone={() => setRecovery(false)} />
  if (!profile) return null // wait for role so /admin isn't redirected on reload

  const name = profile?.full_name || session.user.email
  const isAdmin = profile?.role === 'admin'
  return (
    <div className="shell">
      <aside>
        <div className="brand"><img className="mark" src="/logo.png" alt="Learn French Academy logo" /><span>Learn French<br />Academy</span></div>
        <button className="menu-btn" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} aria-controls="drawer" onClick={() => setMenu(!menu)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">{menu ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
        </button>
        <div className="drawer" id="drawer" data-open={menu}>
        <nav>{[...nav, ...(isAdmin ? [['/admin', 'Admin']] : [])].map(([to, label]) => <NavLink key={to} to={to} end>{label}</NavLink>)}</nav>
        <div className="pushbox">
          {push === true ? <span>🔔 Notifications on</span>
            : <button className="link" onClick={async () => { const m = await enablePush(); setPush(m.startsWith('Notifications are on') ? true : m) }}>Turn on notifications</button>}
          {typeof push === 'string' && <small>{push}</small>}
        </div>
        <div className="who">
          <div className="av">{name.slice(0, 2).toUpperCase()}</div>
          <div><b>{name}</b><br />{isAdmin ? 'Admin' : 'Tutor'} · <NavLink to="/account" className="link">Account</NavLink> · <button className="link" onClick={() => sb.auth.signOut()}>Sign out</button></div>
        </div>
        </div>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Today name={name} />} />
          <Route path="/library" element={<Library />} />
          <Route path="/classes" element={<Classes />} />
          <Route path="/students" element={<Students />} />
          <Route path="/report" element={<Report />} />
          <Route path="/account" element={<Account email={session.user.email} />} />
          {isAdmin && <Route path="/admin" element={<Admin />} />}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}
