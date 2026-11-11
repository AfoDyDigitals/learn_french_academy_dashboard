import { sb } from '../supabase'
import { useRows, Lvl, fmtTime, fmtDay, State } from '../ui'
import { PageHeader } from '../components'

export default function Classes() {
  const from = new Date(); from.setHours(0, 0, 0, 0)
  const to = new Date(from); to.setDate(to.getDate() + 7)
  const [rows, err] = useRows(() => sb.from('classes').select('*').gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at'))

  const days = Object.entries((rows || []).reduce((m, c) => { const d = fmtDay(c.starts_at); (m[d] ||= []).push(c); return m }, {}))

  return (
    <section>
      <PageHeader title="Classes" sub="Your next 7 days. Times are Lagos time." />
      <State rows={rows} err={err} empty="No classes scheduled this week." />
      <div className="week">
        {days.map(([d, cs]) => (
          <div className="panel weekday" key={d}>
            <h3>{d}</h3>
            {cs.map(c => (
              <div className="slot" key={c.id}>
                <span className="time">{fmtTime(c.starts_at)}</span><Lvl l={c.level} />
                <div className="grow"><b>{c.title}</b><div className="meta">{c.duration_min} min</div></div>
                {c.meet_url && <a className="pill info" href={c.meet_url} target="_blank" rel="noreferrer">Join Meet</a>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
