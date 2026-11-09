import { sb } from '../supabase'
import { useRows, Lvl, State } from '../ui'

export default function Students() {
  const [rows, err] = useRows(() => sb.from('students').select('id, full_name, level, goal, exam_date, hours_per_week, status, class_students(attended)').order('full_name'))

  const attendance = s => {
    const marked = s.class_students.filter(c => c.attended !== null)
    return marked.length ? Math.round(100 * marked.filter(c => c.attended).length / marked.length) : null
  }

  return (
    <section>
      <div className="top"><div><h1>My students</h1><p className="sub">Students assigned to you</p></div></div>
      <State rows={rows} err={err} empty="No students assigned to you yet." />
      {rows?.length > 0 && (
        <div className="panel scroll">
          <table>
            <thead><tr><th>Student</th><th>Course</th><th>Goal</th><th>Hours/week</th><th>Attendance</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map(s => {
                const a = attendance(s)
                return (
                  <tr key={s.id}>
                    <td><b>{s.full_name}</b></td><td><Lvl l={s.level} /></td>
                    <td>{s.goal === 'tcf' ? `TCF${s.exam_date ? ` · ${s.exam_date}` : ''}` : 'General'}</td>
                    <td>{s.hours_per_week ?? '–'}</td>
                    <td>{a === null ? '–' : <div className="barwrap"><div className="bar"><i style={{ width: `${a}%` }} /></div>{a}%</div>}</td>
                    <td><span className={`pill ${s.status === 'active' ? 'ok' : 'warn'}`}>{s.status}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
