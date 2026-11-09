import { sb } from '../supabase'
import { useRows, Lvl, fmtTime, fmtDay, State } from '../ui'

export default function Classes() {
  const from = new Date(); from.setHours(0, 0, 0, 0)
  const to = new Date(from); to.setDate(to.getDate() + 7)
  const [rows, err] = useRows(() => sb.from('classes').select('*').gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at'))

  const days = Object.entries((rows || []).reduce((m, c) => { const d = fmtDay(c.starts_at); (m[d] ||= []).push(c); return m }, {}))

  return (
    <section>
      <div className="top"><div><h1>Next 7 days</h1><p className="sub">All times WAT (Lagos)</p></div></div>
      <State rows={rows} err={err} empty="No classes scheduled this week." />
      <div className="week">
        {days.map(([d, cs]) => (
          <div className="panel day" key={d}>
            <h3>{d}</h3>
            {cs.map(c => (
              <div className="slot" key={c.id}>
                <Lvl l={c.level} /> <b>{fmtTime(c.starts_at)}</b>{c.title}
                {c.meet_url && <div><a href={c.meet_url} target="_blank" rel="noreferrer">Join Meet</a></div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
