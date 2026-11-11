import { useState } from 'react'
import { sb } from '../supabase'
import { useRows, Lvl, fmtDay, fmtTime, State } from '../ui'

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'TCF']
const TABS = ['Students', 'Classes', 'Resources', 'Payments', 'Reports', 'Tutors']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Class times are entered and shown in Lagos time (UTC+1, no daylight saving)
const lagosToISO = v => new Date(`${v}:00+01:00`).toISOString()

export default function Admin() {
  const [tab, setTab] = useState('Students')
  const [tutors] = useRows(() => sb.from('profiles').select('id, full_name, role').order('full_name'))
  const [students, , reloadStudents] = useRows(() => sb.from('students').select('*, profiles(full_name)').order('full_name'))
  const ctx = { tutors: tutors || [], students: students || [], reloadStudents }
  const View = { Students: StudentsTab, Classes: ClassesTab, Resources: ResourcesTab, Payments: PaymentsTab, Reports: ReportsTab, Tutors: TutorsTab }[tab]
  return (
    <section>
      <div className="top"><div><h1>Admin</h1><p className="sub">Manage students, classes, resources and payments.</p></div></div>
      <div className="filters">{TABS.map(t => <button key={t} className="chip" aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}</div>
      <View {...ctx} />
    </section>
  )
}

// Small form helper: fields = [[key, label, type, options?, show?(values)]]
function QuickForm({ title, fields, onSave, initial = {} }) {
  const [v, setV] = useState(initial)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    const error = await onSave(v)
    setBusy(false)
    if (error) return setMsg(`Not saved: ${error.message}`)
    setV(initial); setMsg('Saved.')
  }
  return (
    <form className="panel form-grid" onSubmit={submit}>
      <h2>{title}</h2>
      {fields.filter(f => !f[4] || f[4](v)).map(([k, label, type = 'text', opts]) => (
        <div className="field" key={k}>
          <label htmlFor={`f-${k}`}>{label}</label>
          {type === 'select' ? (
            <select id={`f-${k}`} value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })}>
              <option value="">Choose…</option>
              {opts.map(o => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o}>{o}</option>)}
            </select>
          ) : type === 'days' ? (
            <div className="multi">{DAYS.map((d, i) => (
              <label key={d} className="check"><input type="checkbox" checked={(v[k] || []).includes(i + 1)}
                onChange={e => setV({ ...v, [k]: e.target.checked ? [...(v[k] || []), i + 1] : v[k].filter(x => x !== i + 1) })} /> {d}</label>
            ))}</div>
          ) : type === 'multi' ? (
            <div className="multi">{opts.length ? opts.map(([id, name]) => (
              <label key={id} className="check"><input type="checkbox" checked={(v[k] || []).includes(id)}
                onChange={e => setV({ ...v, [k]: e.target.checked ? [...(v[k] || []), id] : v[k].filter(x => x !== id) })} /> {name}</label>
            )) : <span className="meta">Add students first.</span>}</div>
          ) : (
            <input id={`f-${k}`} type={type} value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} />
          )}
        </div>
      ))}
      {msg && <p className="note">{msg}</p>}
      <div><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
    </form>
  )
}

const clean = o => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, x === '' ? null : x]))
const tutorOpts = tutors => tutors.map(t => [t.id, t.full_name || 'Unnamed tutor'])

function StudentsTab({ tutors, students, reloadStudents }) {
  const update = async (id, patch) => { await sb.from('students').update(patch).eq('id', id); reloadStudents() }
  return (
    <div className="grid">
      <QuickForm title="Add student" initial={{ goal: 'general' }}
        fields={[['full_name', 'Full name'], ['email', 'Email', 'email'], ['phone', 'Phone'], ['country', 'Country'],
          ['level', 'Level', 'select', LEVELS], ['goal', 'Goal', 'select', [['general', 'General French'], ['tcf', 'TCF prep']]],
          ['exam_date', 'TCF exam date', 'date', null, v => v.goal === 'tcf'], ['hours_per_week', 'Hours per week', 'number'], ['tutor_id', 'Tutor', 'select', tutorOpts(tutors)]]}
        onSave={async v => { const { error } = await sb.from('students').insert(clean({ ...v, exam_date: v.goal === 'tcf' ? v.exam_date : null })); reloadStudents(); return error }} />
      <div className="panel scroll">
        <h2>All students</h2>
        <State rows={students} empty="No students yet." />
        {students.length > 0 && <table>
          <thead><tr><th>Name</th><th>Level</th><th>Country</th><th>Contact</th><th>Tutor</th><th>Status</th></tr></thead>
          <tbody>{students.map(s => (
            <tr key={s.id}>
              <td><b>{s.full_name}</b>{s.goal === 'tcf' && <div className="meta">TCF {s.exam_date || ''}</div>}</td>
              <td><Lvl l={s.level} /></td><td>{s.country || '–'}</td>
              <td className="meta">{s.email}<br />{s.phone}</td>
              <td><select aria-label="Tutor" value={s.tutor_id || ''} onChange={e => update(s.id, { tutor_id: e.target.value || null })}>
                <option value="">Unassigned</option>{tutorOpts(tutors).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></td>
              <td><select aria-label="Status" value={s.status} onChange={e => update(s.id, { status: e.target.value })}>
                {['active', 'paused', 'finished'].map(x => <option key={x}>{x}</option>)}</select></td>
            </tr>))}</tbody>
        </table>}
      </div>
    </div>
  )
}

function ClassesTab({ tutors, students }) {
  const from = new Date(); from.setDate(from.getDate() - 7)
  const [rows, err, reload] = useRows(() => sb.from('classes').select('*, profiles(full_name), class_students(student_id)').gte('starts_at', from.toISOString()).order('starts_at'))
  async function save(v) {
    const { students: ids = [], starts_at, ...rest } = v
    if (!starts_at) return { message: 'Pick a date and time.' }
    const { data, error } = await sb.from('classes').insert(clean({ ...rest, starts_at: lagosToISO(starts_at) })).select('id').single()
    if (error) return error
    if (ids.length) { const r = await sb.from('class_students').insert(ids.map(student_id => ({ class_id: data.id, student_id }))); if (r.error) return r.error }
    reload()
  }
  async function remove(id) { await sb.from('classes').delete().eq('id', id); reload() }
  const [scheds, , reloadScheds] = useRows(() => sb.from('schedules').select('*, profiles(full_name)').order('start_date', { ascending: false }))
  const activeStudents = students.filter(s => s.status === 'active').map(s => [s.id, `${s.full_name} (${s.level})`])
  const [editing, setEditing] = useState(null) // schedule being edited, or null for a new one
  const [made, setMade] = useState('')
  async function saveSchedule(v) {
    if (!v.weekdays?.length) return { message: 'Pick at least one class day.' }
    const p = { ...v, student_ids: v.student_ids || [] }
    const { data, error } = editing
      ? await sb.rpc('update_schedule', { p_id: editing.id, p })
      : await sb.rpc('create_schedule', { p })
    if (error) return error
    setMade(editing ? `Schedule updated. ${data} upcoming classes rebuilt.` : `${data} classes created for the whole contract.`)
    setEditing(null); reload(); reloadScheds()
  }
  function startEdit(s) {
    setMade('')
    setEditing({ ...s, start_time: s.start_time.slice(0, 5), meet_url: s.meet_url || '', tutor_id: s.tutor_id || '' })
    document.getElementById('sched-form')?.scrollIntoView({ behavior: 'smooth' })
  }
  async function endSchedule(id) { await sb.rpc('end_schedule', { p_id: id }); reload(); reloadScheds() }
  return (
    <div className="grid">
      <div id="sched-form" className="grid">
      {editing && <p className="note">Editing <b>{editing.title}</b>. Changes apply to classes from now on; past classes and reports stay as they are. <button className="link alt" onClick={() => setEditing(null)}>Cancel edit</button></p>}
      <QuickForm key={editing?.id || 'new'} title={editing ? 'Edit recurring schedule' : 'Recurring schedule (set once per contract)'}
        initial={editing || { duration_min: 90, weeks: 8, weekdays: [] }}
        fields={[['title', 'Course name, e.g. A1 Evening'], ['level', 'Level', 'select', LEVELS], ['tutor_id', 'Tutor', 'select', tutorOpts(tutors)],
          ['weekdays', 'Class days', 'days'], ['start_time', 'Start time (Lagos)', 'time'], ['duration_min', 'Duration (minutes)', 'number'],
          ['start_date', 'Contract start date', 'date'], ['weeks', 'Contract length (weeks)', 'number'], ['meet_url', 'Google Meet link (same every class)', 'url'],
          ['student_ids', 'Students', 'multi', activeStudents]]}
        onSave={saveSchedule} />
      </div>
      {made && <p className="note">{made}</p>}
      <div className="panel scroll">
        <h2>Active schedules</h2>
        <State rows={scheds} empty="No recurring schedules yet." />
        {scheds?.length > 0 && <table>
          <thead><tr><th>Course</th><th>Tutor</th><th>Days</th><th>Time</th><th>Runs</th><th>Students</th><th></th></tr></thead>
          <tbody>{scheds.map(s => {
            const end = new Date(s.start_date); end.setDate(end.getDate() + s.weeks * 7 - 1)
            return (
              <tr key={s.id}><td><Lvl l={s.level} /> {s.title}</td><td>{s.profiles?.full_name || '–'}</td>
                <td>{s.weekdays.map(d => DAYS[d - 1]).join(', ')}</td><td>{s.start_time.slice(0, 5)}</td>
                <td>{s.start_date} → {end.toISOString().slice(0, 10)}</td><td>{s.student_ids.length}</td>
                <td className="actions"><button className="link alt" onClick={() => startEdit(s)}>Edit</button> <button className="link danger" onClick={() => endSchedule(s.id)}>End early</button></td></tr>)
          })}</tbody>
        </table>}
      </div>
      <QuickForm title="One-off class (extra or make-up)" initial={{ duration_min: 90 }}
        fields={[['title', 'Topic'], ['level', 'Level', 'select', LEVELS], ['week_no', 'Week no.', 'number'],
          ['starts_at', 'Date and time (Lagos)', 'datetime-local'], ['duration_min', 'Duration (minutes)', 'number'],
          ['meet_url', 'Google Meet link', 'url'], ['tutor_id', 'Tutor', 'select', tutorOpts(tutors)],
          ['students', 'Students', 'multi', activeStudents]]}
        onSave={save} />
      <div className="panel scroll">
        <h2>Recent and upcoming classes</h2>
        <State rows={rows} err={err} empty="No classes scheduled." />
        {rows?.length > 0 && <table>
          <thead><tr><th>When (Lagos)</th><th>Class</th><th>Tutor</th><th>Students</th><th></th></tr></thead>
          <tbody>{rows.map(c => (
            <tr key={c.id}><td>{fmtDay(c.starts_at)} {fmtTime(c.starts_at)}</td><td><Lvl l={c.level} /> {c.title}</td>
              <td>{c.profiles?.full_name || '–'}</td><td>{c.class_students.length}</td>
              <td><button className="link danger" onClick={() => remove(c.id)}>Remove</button></td></tr>))}</tbody>
        </table>}
      </div>
    </div>
  )
}

function ResourcesTab() {
  const [rows, err, reload] = useRows(() => sb.from('resources').select('*').order('level').order('title'))
  return (
    <div className="grid">
      <QuickForm title="Add resource" initial={{ skill: 'Listening' }}
        fields={[['title', 'Title'], ['level', 'Level', 'select', LEVELS], ['skill', 'Skill', 'select', ['Listening', 'Speaking', 'Reading', 'Writing', 'Grammar']],
          ['source', 'Source (e.g. TV5Monde)'], ['url', 'Link', 'url']]}
        onSave={async v => { const { error } = await sb.from('resources').insert(clean(v)); reload(); return error }} />
      <div className="panel scroll">
        <h2>Library ({rows?.length ?? 0})</h2>
        <State rows={rows} err={err} empty="No resources yet." />
        {rows?.length > 0 && <table>
          <thead><tr><th>Title</th><th>Level</th><th>Skill</th><th>Source</th><th></th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}><td><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a></td><td><Lvl l={r.level} /></td><td>{r.skill}</td><td>{r.source}</td>
              <td><button className="link danger" onClick={async () => { await sb.from('resources').delete().eq('id', r.id); reload() }}>Remove</button></td></tr>))}</tbody>
        </table>}
      </div>
    </div>
  )
}

function PaymentsTab({ students }) {
  const [rows, err, reload] = useRows(() => sb.from('payments').select('*, students(full_name)').order('created_at', { ascending: false }))
  const totals = (rows || []).filter(p => p.status === 'paid').reduce((m, p) => ({ ...m, [p.currency]: (m[p.currency] || 0) + Number(p.amount) }), {})
  const money = (n, c) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n)
  return (
    <div className="grid">
      <QuickForm title="Log payment" initial={{ currency: 'NGN', status: 'paid', method: 'paystack' }}
        fields={[['student_id', 'Student', 'select', students.map(s => [s.id, s.full_name])], ['amount', 'Amount', 'number'],
          ['currency', 'Currency', 'select', ['NGN', 'USD']], ['method', 'Method', 'select', [['paystack', 'Paystack'], ['paypal', 'PayPal'], ['transfer', 'Bank transfer']]],
          ['reference', 'Reference'], ['period_month', 'For month', 'month'], ['status', 'Status', 'select', ['paid', 'pending', 'failed']]]}
        onSave={async v => {
          const row = clean({ ...v, period_month: v.period_month ? `${v.period_month}-01` : null, paid_at: v.status === 'paid' ? new Date().toISOString() : null })
          const { error } = await sb.from('payments').insert(row); reload(); return error
        }} />
      <div className="panel scroll">
        <h2>Payments</h2>
        <p className="meta">Total paid: {Object.entries(totals).map(([c, n]) => money(n, c)).join(' · ') || 'none yet'}</p>
        <State rows={rows} err={err} empty="No payments logged yet." />
        {rows?.length > 0 && <table>
          <thead><tr><th>Student</th><th>Amount</th><th>Method</th><th>Month</th><th>Status</th></tr></thead>
          <tbody>{rows.map(p => (
            <tr key={p.id}><td>{p.students?.full_name}</td><td>{money(p.amount, p.currency)}</td><td>{p.method}</td>
              <td>{p.period_month?.slice(0, 7) || '–'}</td>
              <td><span className={`pill ${p.status === 'paid' ? 'ok' : p.status === 'pending' ? 'warn' : 'bad'}`}>{p.status}</span></td></tr>))}</tbody>
        </table>}
      </div>
    </div>
  )
}

function ReportsTab() {
  const [rows, err] = useRows(() => sb.from('reports').select('*, classes(title, level, starts_at), profiles(full_name)').order('created_at', { ascending: false }).limit(50))
  return (
    <div className="panel">
      <h2>Class reports</h2>
      <State rows={rows} err={err} empty="No reports filed yet." />
      <div className="list">{rows?.map(r => (
        <div className="row" key={r.id} style={{ alignItems: 'flex-start' }}>
          {r.classes && <Lvl l={r.classes.level} />}
          <div className="grow">
            <b>{r.classes?.title}</b> <span className="meta">· {r.classes && fmtDay(r.classes.starts_at)} · {r.profiles?.full_name}{r.duration_min ? ` · ${r.duration_min} min` : ''}</span>
            <div>{r.covered}</div>
            {r.homework && <div className="meta">Homework: {r.homework}</div>}
            {r.notes && <div className="note" style={{ marginTop: 6 }}>{r.notes}</div>}
          </div>
        </div>))}</div>
    </div>
  )
}

function TutorsTab({ tutors }) {
  const [list, , reload] = useRows(() => sb.from('profiles').select('*').order('created_at'))
  const update = async (id, patch) => { await sb.from('profiles').update(patch).eq('id', id); reload() }
  return (
    <div className="grid">
      <div className="panel">
        <h2>Add a tutor</h2>
        <p>In Supabase, open <b>Authentication → Users → Add user → Create new user</b>, enter the tutor's email and a temporary password, and tick <b>Auto confirm</b>. They appear here as a tutor. Set their name below so they show up in the student and class forms.</p>
      </div>
      <div className="panel scroll">
        <h2>Team ({(list || tutors).length})</h2>
        <table>
          <thead><tr><th>Name</th><th>Role</th></tr></thead>
          <tbody>{(list || []).map(t => (
            <tr key={t.id}>
              <td><input aria-label="Name" defaultValue={t.full_name || ''} placeholder="Add name" onBlur={e => e.target.value !== (t.full_name || '') && update(t.id, { full_name: e.target.value })} /></td>
              <td><select aria-label="Role" value={t.role} onChange={e => update(t.id, { role: e.target.value })}><option>tutor</option><option>admin</option></select></td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  )
}
