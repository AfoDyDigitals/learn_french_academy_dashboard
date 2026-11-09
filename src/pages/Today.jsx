import { Link } from 'react-router-dom'
import { sb } from '../supabase'
import { useRows, Lvl, fmtTime, State } from '../ui'

export default function Today({ name }) {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(start); end.setDate(end.getDate() + 1)
  const weekEnd = new Date(start); weekEnd.setDate(weekEnd.getDate() + 7)

  const [today, err] = useRows(() => sb.from('classes').select('*').gte('starts_at', start.toISOString()).lt('starts_at', end.toISOString()).order('starts_at'))
  const [week] = useRows(() => sb.from('classes').select('duration_min').gte('starts_at', start.toISOString()).lt('starts_at', weekEnd.toISOString()))
  const [students] = useRows(() => sb.from('students').select('level').eq('status', 'active'))

  const hours = (week || []).reduce((s, c) => s + c.duration_min, 0) / 60
  const byLevel = Object.entries((students || []).reduce((m, s) => ({ ...m, [s.level]: (m[s.level] || 0) + 1 }), {})).map(([l, n]) => `${l} ×${n}`).join(' · ')

  return (
    <section>
      <div className="top">
        <div><h1>Bonjour, {name.split(' ')[0]}</h1><p className="sub">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {today?.length ?? 0} live classes today</p></div>
        <Link className="btn" to="/library">Find material</Link>
      </div>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="panel stat"><div className="k">Classes next 7 days</div><div className="v">{week?.length ?? '–'}</div><div className="n">{hours} teaching hours</div></div>
        <div className="panel stat"><div className="k">Active students</div><div className="v">{students?.length ?? '–'}</div><div className="n">{byLevel || 'None assigned yet'}</div></div>
        <div className="panel stat"><div className="k">After class</div><div className="v">2 min</div><div className="n"><Link to="/report">File a class report</Link></div></div>
      </div>
      <div className="panel">
        <h2>Today's classes</h2>
        <State rows={today} err={err} empty="No classes today." />
        <div className="list">
          {today?.map(c => (
            <div className="row" key={c.id}>
              <span className="time">{fmtTime(c.starts_at)}</span><Lvl l={c.level} />
              <div className="grow"><b>{c.title}</b><div className="meta">{c.week_no ? `Week ${c.week_no} · ` : ''}{c.duration_min / 60} h</div></div>
              {c.meet_url && <a className="pill info" href={c.meet_url} target="_blank" rel="noreferrer">Join Meet</a>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
