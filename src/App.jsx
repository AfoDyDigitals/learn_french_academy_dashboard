import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { sb } from './supabase'
import Login from './pages/Login'
import Today from './pages/Today'
import Library from './pages/Library'
import Classes from './pages/Classes'
import Students from './pages/Students'
import Report from './pages/Report'

const nav = [['/', 'Today'], ['/library', 'Library'], ['/classes', 'Classes'], ['/students', 'Students'], ['/report', 'Class report']]

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return setProfile(null)
    sb.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => setProfile(data))
  }, [session])

  if (session === undefined) return null
  if (!session) return <Login />

  const name = profile?.full_name || session.user.email
  return (
    <div className="shell">
      <aside>
        <div className="brand"><img className="mark" src="/logo.png" alt="Learn French Academy logo" /><span>Learn French<br />Academy</span></div>
        <nav>{nav.map(([to, label]) => <NavLink key={to} to={to} end>{label}</NavLink>)}</nav>
        <div className="who">
          <div className="av">{name.slice(0, 2).toUpperCase()}</div>
          <div><b>{name}</b><br />{profile?.role === 'admin' ? 'Admin' : 'Tutor'} · <button className="link" onClick={() => sb.auth.signOut()}>Sign out</button></div>
        </div>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Today name={name} />} />
          <Route path="/library" element={<Library />} />
          <Route path="/classes" element={<Classes />} />
          <Route path="/students" element={<Students />} />
          <Route path="/report" element={<Report />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}
