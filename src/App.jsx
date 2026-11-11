import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { sb } from './supabase'
import Login from './pages/Login'
import Today from './pages/Today'
import Library from './pages/Library'
import Classes from './pages/Classes'
import Students from './pages/Students'
import Report from './pages/Report'
import { AdminOverview, AdminClasses, AdminStudents, AdminTutors, AdminReports, AdminPayments, AdminLibrary } from './pages/Admin'
import Account from './pages/Account'
import SetPassword from './pages/SetPassword'
import { enablePush, pushEnabled } from './push'

// Tutors and admins get completely separate menus and pages
const TUTOR_NAV = [['/', 'Today'], ['/library', 'Library'], ['/classes', 'Classes'], ['/students', 'My students'], ['/report', 'Class report']]
const ADMIN_NAV = [['/', 'Overview'], ['/classes', 'Classes'], ['/students', 'Students'], ['/tutors', 'Tutors'], ['/reports', 'Reports'], ['/payments', 'Payments'], ['/library', 'Library']]

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
  useEffect(() => { document.body.style.overflow = menu ? 'hidden' : '' }, [menu]) // no page scroll behind the open menu

  useEffect(() => { if (session) pushEnabled().then(on => on && setPush(true)) }, [session])

  if (session === undefined) return null
  if (!session) return <Login />
  if (recovery) return <SetPassword onDone={() => setRecovery(false)} />
  if (!profile) return null // wait for role before choosing a menu

  const name = profile.full_name || session.user.email
  const isAdmin = profile.role === 'admin'
  const signOut = () => sb.auth.signOut()

  if (!isAdmin && !profile.active) return (
    <div className="login">
      <div className="panel">
        <img src="/logo.png" alt="" height="64" />
        <h1>Your access is paused</h1>
        <p className="sub">Your tutor account is on hold. An admin will turn it back on when your contract resumes. Your classes and reports are kept.</p>
        <button className="btn" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )

  return (
    <div className="shell">
      <aside>
        <div className="brand"><img className="mark" src="/logo.png" alt="Learn French Academy logo" /><span>Learn French<br />Academy</span></div>
        <button className="menu-btn" aria-label="Open menu" aria-expanded={menu} aria-controls="drawer" onClick={() => setMenu(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <div className="backdrop" data-open={menu} onClick={() => setMenu(false)} aria-hidden="true" />
        <div className="drawer" id="drawer" data-open={menu}>
          <div className="drawer-head">
            <span>{isAdmin ? 'Admin' : 'Menu'}</span>
            <button className="menu-btn" aria-label="Close menu" onClick={() => setMenu(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <nav>{(isAdmin ? ADMIN_NAV : TUTOR_NAV).map(([to, label]) => <NavLink key={to} to={to} end>{label}</NavLink>)}</nav>
          <div className="pushbox">
            {push === true ? <span>🔔 Notifications on</span>
              : <button className="link" onClick={async () => { const m = await enablePush(); setPush(m.startsWith('Notifications are on') ? true : m) }}>Turn on notifications</button>}
            {typeof push === 'string' && <small>{push}</small>}
          </div>
          <div className="who">
            <div className="av">{name.slice(0, 2).toUpperCase()}</div>
            <div><b>{name}</b><br />{isAdmin ? 'Admin' : 'Tutor'} · <NavLink to="/account" className="link">Account</NavLink> · <button className="link" onClick={signOut}>Sign out</button></div>
          </div>
        </div>
      </aside>
      <main>
        {isAdmin ? (
          <Routes>
            <Route path="/" element={<AdminOverview name={name} />} />
            <Route path="/classes" element={<AdminClasses />} />
            <Route path="/students" element={<AdminStudents />} />
            <Route path="/tutors" element={<AdminTutors me={profile.id} />} />
            <Route path="/reports" element={<AdminReports />} />
            <Route path="/payments" element={<AdminPayments />} />
            <Route path="/library" element={<AdminLibrary />} />
            <Route path="/account" element={<Account email={session.user.email} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/" element={<Today name={name} />} />
            <Route path="/library" element={<Library />} />
            <Route path="/classes" element={<Classes />} />
            <Route path="/students" element={<Students />} />
            <Route path="/report" element={<Report />} />
            <Route path="/account" element={<Account email={session.user.email} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        )}
      </main>
    </div>
  )
}
