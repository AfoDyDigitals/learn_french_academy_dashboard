import { useState } from 'react'
import { sb } from '../supabase'
import { useRows, Lvl, State, fmtDay, LEVELS } from '../ui'
import { PageHeader, Toolbar, Table } from '../components'

const attendance = s => {
  const marked = s.class_students.filter(c => c.attended !== null)
  return marked.length ? Math.round(100 * marked.filter(c => c.attended).length / marked.length) : null
}

export default function Students() {
  const [rows, err] = useRows(() => sb.from('students').select('id, full_name, level, goal, exam_date, hours_per_week, status, class_students(attended)').order('full_name'))
  const [q, setQ] = useState('')
  const defaults = { status: 'active' }
  const [f, setF] = useState(defaults)
  const shown = (rows || []).filter(s => s.full_name.toLowerCase().includes(q.toLowerCase()) && (!f.status || s.status === f.status) && (!f.level || s.level === f.level))

  return (
    <section>
      <PageHeader title="My students" sub="Students assigned to you." />
      <Toolbar search={q} onSearch={setQ} placeholder="Search students" values={f} onChange={setF} defaults={defaults}
        filters={[['status', 'Status', 'select', [['active', 'Active'], ['paused', 'Paused'], ['finished', 'Finished'], ['', 'Any status']]], ['level', 'Level', 'select', LEVELS]]} />
      <div className="panel flush">
        <State rows={rows && shown} err={err} empty={rows?.length ? 'No students match.' : 'No students assigned to you yet.'} />
        {shown.length > 0 && <Table head={['Student', 'Level', 'Goal', 'Hours/week', 'Attendance', 'Status']} rows={shown.map(s => {
          const a = attendance(s)
          return { key: s.id, cells: [
            <b>{s.full_name}</b>, <Lvl l={s.level} />,
            s.goal === 'tcf' ? `TEF/TCF${s.exam_date ? ` · ${fmtDay(s.exam_date)}` : ''}` : 'General French',
            s.hours_per_week ?? '–',
            a === null ? <span className="meta">–</span> : <div className="barwrap"><div className="bar"><i style={{ width: `${a}%` }} /></div>{a}%</div>,
            <span className={`pill ${s.status === 'active' ? 'ok' : 'warn'}`}>{s.status}</span>,
          ] }
        })} />}
      </div>
    </section>
  )
}
