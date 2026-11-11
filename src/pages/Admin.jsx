import { useState } from 'react'
import { sb } from '../supabase'
import { useRows, Lvl, fmtDay, fmtTime, State } from '../ui'

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'TCF']
const SKILLS = ['Listening', 'Speaking', 'Reading', 'Writing', 'Grammar']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Class times are entered and shown in Lagos time (UTC+1, no daylight saving)
const lagosToISO = v => new Date(`${v}:00+01:00`).toISOString()
const clean = o => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, x === '' ? null : x]))
const dayStr = d => d.toISOString().slice(0, 10)
const addDays = (n, d = new Date()) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const money = (n, c) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n)
const ended = c => new Date(c.starts_at).getTime() + c.duration_min * 60000 < Date.now()

// Shared data
const useTutors = () => useRows(() => sb.from('profiles').select('id, full_name, role, active').eq('role', 'tutor').order('full_name'))
const useStudents = () => useRows(() => sb.from('students').select('*, profiles(full_name), class_students(attended)').order('full_name'))
const tutorOpts = (tutors, all = false) => (tutors || []).filter(t => all || t.active)
  .map(t => [t.id, `${t.full_name || 'Unnamed tutor'}${t.active ? '' : ' (paused)'}`])

function Page({ title, sub, children }) {
  return <section><div className="top"><div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div></div><div className="grid">{children}</div></section>
}

function Filters({ items, v, set }) {
  return (
    <div className="panel filter-bar">
      {items.map(([k, label, type, opts]) => (
        <div className="field" key={k}>
          <label htmlFor={`flt-${k}`}>{label}</label>
          {type === 'select'
            ? <select id={`flt-${k}`} value={v[k] ?? ''} onChange={e => set({ ...v, [k]: e.target.value })}>
                <option value="">All</option>
                {opts.map(o => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o}>{o}</option>)}
              </select>
            : <input id={`flt-${k}`} type={type} value={v[k] ?? ''} onChange={e => set({ ...v, [k]: e.target.value })} />}
        </div>
      ))}
    </div>
  )
}

// Small form helper: fields = [[key, label, type, options?, show?(values)]]
function QuickForm({ title, fields, onSave, initial = {}, onCancel }) {
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
  const toggle = (k, id, on) => setV({ ...v, [k]: on ? [...(v[k] || []), id] : (v[k] || []).filter(x => x !== id) })
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
              <label key={d} className="check"><input type="checkbox" checked={(v[k] || []).includes(i + 1)} onChange={e => toggle(k, i + 1, e.target.checked)} /> {d}</label>
            ))}</div>
          ) : type === 'multi' ? (
            <div className="multi">{opts.length ? opts.map(([id, name]) => (
              <label key={id} className="check"><input type="checkbox" checked={(v[k] || []).includes(id)} onChange={e => toggle(k, id, e.target.checked)} /> {name}</label>
            )) : <span className="meta">Add students first.</span>}</div>
          ) : (
            <input id={`f-${k}`} type={type} value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} />
          )}
        </div>
      ))}
      {msg && <p className="note">{msg}</p>}
      <div className="form-actions">
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {onCancel && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}

const attendance = s => {
  const marked = (s.class_students || []).filter(c => c.attended !== null)
  return marked.length ? Math.round(100 * marked.filter(c => c.attended).length / marked.length) : null
}

function MissingReports({ rows }) {
  const missing = (rows || []).filter(c => ended(c) && !c.reports.length)
  return (
    <div className="panel">
      <h2>Missing reports ({missing.length})</h2>
      {!missing.length ? <p className="empty">Every finished class in the last 14 days has a report.</p> : (
        <div className="list">{missing.map(c => (
          <div className="row" key={c.id}><Lvl l={c.level} />
            <div className="grow"><b>{c.title}</b><div className="meta">{fmtDay(c.starts_at)} {fmtTime(c.starts_at)} · {c.profiles?.full_name || 'No tutor'}</div></div>
            <span className="pill bad">No report</span></div>))}</div>
      )}
    </div>
  )
}
const useRecentClasses = () => useRows(() => sb.from('classes').select('id, title, level, starts_at, duration_min, profiles(full_name), reports(id)')
  .gte('starts_at', addDays(-14).toISOString()).lte('starts_at', new Date().toISOString()).order('starts_at', { ascending: false }))

// ---------- Overview ----------
export function AdminOverview({ name }) {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const [today, err] = useRows(() => sb.from('classes').select('*, profiles(full_name)').gte('starts_at', start.toISOString()).lt('starts_at', addDays(1, start).toISOString()).order('starts_at'))
  const [week] = useRows(() => sb.from('classes').select('duration_min').gte('starts_at', start.toISOString()).lt('starts_at', addDays(7, start).toISOString()))
  const [students] = useRows(() => sb.from('students').select('id').eq('status', 'active'))
  const [tutors] = useTutors()
  const [recent] = useRecentClasses()
  const [pays] = useRows(() => sb.from('payments').select('*, students(full_name)').neq('status', 'paid').order('created_at', { ascending: false }))
  const [reports] = useRows(() => sb.from('reports').select('*, classes(title, level, starts_at), profiles(full_name)').order('created_at', { ascending: false }).limit(5))
  const hours = (week || []).reduce((s, c) => s + c.duration_min, 0) / 60

  return (
    <Page title={`Bonjour, ${name.split(' ')[0]}`} sub={`${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · Admin overview`}>
      <div className="grid cols-4">
        <div className="panel stat"><div className="k">Classes today</div><div className="v">{today?.length ?? '–'}</div></div>
        <div className="panel stat"><div className="k">Next 7 days</div><div className="v">{week?.length ?? '–'}</div><div className="n">{hours} teaching hours</div></div>
        <div className="panel stat"><div className="k">Active students</div><div className="v">{students?.length ?? '–'}</div></div>
        <div className="panel stat"><div className="k">Active tutors</div><div className="v">{tutors?.filter(t => t.active).length ?? '–'}</div><div className="n">{tutors?.filter(t => !t.active).length || 0} paused</div></div>
      </div>
      <div className="grid cols-2">
        <div className="panel">
          <h2>Today's classes</h2>
          <State rows={today} err={err} empty="No classes today." />
          <div className="list">{today?.map(c => (
            <div className="row" key={c.id}><span className="time">{fmtTime(c.starts_at)}</span><Lvl l={c.level} />
              <div className="grow"><b>{c.title}</b><div className="meta">{c.profiles?.full_name || 'No tutor'} · {c.duration_min} min</div></div>
              {c.meet_url && <a className="pill info" href={c.meet_url} target="_blank" rel="noreferrer">Meet</a>}</div>))}</div>
        </div>
        <MissingReports rows={recent} />
      </div>
      <div className="grid cols-2">
        <div className="panel">
          <h2>Payments to follow up ({pays?.length ?? 0})</h2>
          <State rows={pays} empty="No pending or failed payments." />
          <div className="list">{pays?.map(p => (
            <div className="row" key={p.id}><div className="grow"><b>{p.students?.full_name}</b><div className="meta">{money(p.amount, p.currency)} · {p.period_month?.slice(0, 7) || 'no month'}</div></div>
              <span className={`pill ${p.status === 'pending' ? 'warn' : 'bad'}`}>{p.status}</span></div>))}</div>
        </div>
        <div className="panel">
          <h2>Latest reports</h2>
          <State rows={reports} empty="No reports yet." />
          <div className="list">{reports?.map(r => (
            <div className="row" key={r.id}>{r.classes && <Lvl l={r.classes.level} />}
              <div className="grow"><b>{r.classes?.title}</b><div className="meta">{r.profiles?.full_name} · {r.classes && fmtDay(r.classes.starts_at)}</div></div></div>))}</div>
        </div>
      </div>
    </Page>
  )
}

// ---------- Classes ----------
export function AdminClasses() {
  const [tutors] = useTutors()
  const [students] = useStudents()
  const [f, setF] = useState({ from: dayStr(addDays(-7)), to: dayStr(addDays(14)) })
  const [rows, err, reload] = useRows(() => {
    let q = sb.from('classes').select('*, profiles(full_name), class_students(student_id)')
      .gte('starts_at', new Date(`${f.from}T00:00:00+01:00`).toISOString()).lte('starts_at', new Date(`${f.to}T23:59:59+01:00`).toISOString()).order('starts_at')
    if (f.tutor) q = q.eq('tutor_id', f.tutor)
    if (f.level) q = q.eq('level', f.level)
    return q
  }, [f.from, f.to, f.tutor, f.level])
  const [scheds, , reloadScheds] = useRows(() => sb.from('schedules').select('*, profiles(full_name)').order('start_date', { ascending: false }))
  const activeStudents = (students || []).filter(s => s.status === 'active').map(s => [s.id, `${s.full_name} (${s.level})`])
  const [editing, setEditing] = useState(null)
  const [made, setMade] = useState('')

  async function saveOne(v) {
    const { students: ids = [], starts_at, ...rest } = v
    if (!starts_at) return { message: 'Pick a date and time.' }
    const { data, error } = await sb.from('classes').insert(clean({ ...rest, starts_at: lagosToISO(starts_at) })).select('id').single()
    if (error) return error
    if (ids.length) { const r = await sb.from('class_students').insert(ids.map(student_id => ({ class_id: data.id, student_id }))); if (r.error) return r.error }
    reload()
  }
  async function saveSchedule(v) {
    if (!v.weekdays?.length) return { message: 'Pick at least one class day.' }
    const p = { ...v, student_ids: v.student_ids || [] }
    const { data, error } = editing ? await sb.rpc('update_schedule', { p_id: editing.id, p }) : await sb.rpc('create_schedule', { p })
    if (error) return error
    setMade(editing ? `Schedule updated. ${data} upcoming classes rebuilt.` : `${data} classes created for the whole contract.`)
    setEditing(null); reload(); reloadScheds()
  }
  function startEdit(s) {
    setMade('')
    setEditing({ ...s, start_time: s.start_time.slice(0, 5), meet_url: s.meet_url || '', tutor_id: s.tutor_id || '' })
    document.getElementById('sched-form')?.scrollIntoView({ behavior: 'smooth' })
  }
  const endSchedule = async id => { await sb.rpc('end_schedule', { p_id: id }); reload(); reloadScheds() }
  const reassign = async (id, tutor_id) => { await sb.from('classes').update({ tutor_id: tutor_id || null, reminded_at: null }).eq('id', id); reload() }
  const remove = async id => { await sb.from('classes').delete().eq('id', id); reload() }

  return (
    <Page title="Classes" sub="Every tutor's classes, recurring schedules and one-off sessions. Times are Lagos time.">
      <Filters v={f} set={setF} items={[['tutor', 'Tutor', 'select', tutorOpts(tutors, true)], ['level', 'Level', 'select', LEVELS], ['from', 'From', 'date'], ['to', 'To', 'date']]} />
      <div className="panel scroll">
        <h2>Classes ({rows?.length ?? 0})</h2>
        <State rows={rows} err={err} empty="No classes match these filters." />
        {rows?.length > 0 && <table>
          <thead><tr><th>When</th><th>Class</th><th>Tutor</th><th>Students</th><th></th></tr></thead>
          <tbody>{rows.map(c => (
            <tr key={c.id}><td>{fmtDay(c.starts_at)} {fmtTime(c.starts_at)}</td><td><Lvl l={c.level} /> {c.title}</td>
              <td><select aria-label="Tutor" value={c.tutor_id || ''} onChange={e => reassign(c.id, e.target.value)}>
                <option value="">No tutor</option>{tutorOpts(tutors, true).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></td>
              <td>{c.class_students.length}</td>
              <td className="actions">{c.meet_url && <a className="link alt" href={c.meet_url} target="_blank" rel="noreferrer">Meet</a>} <button className="link danger" onClick={() => remove(c.id)}>Remove</button></td></tr>))}</tbody>
        </table>}
      </div>
      <div id="sched-form" className="grid">
        {editing && <p className="note">Editing <b>{editing.title}</b>. Changes apply to classes from now on; past classes and reports stay as they are.</p>}
        <QuickForm key={editing?.id || 'new'} title={editing ? 'Edit recurring schedule' : 'New recurring schedule (set once per contract)'}
          initial={editing || { duration_min: 90, weeks: 8, weekdays: [] }} onCancel={editing ? () => setEditing(null) : null}
          fields={[['title', 'Course name, e.g. A1 Evening'], ['level', 'Level', 'select', LEVELS], ['tutor_id', 'Tutor', 'select', tutorOpts(tutors)],
            ['weekdays', 'Class days', 'days'], ['start_time', 'Start time (Lagos)', 'time'], ['duration_min', 'Duration (minutes)', 'number'],
            ['start_date', 'Contract start date', 'date'], ['weeks', 'Contract length (weeks)', 'number'], ['meet_url', 'Google Meet link (same every class)', 'url'],
            ['student_ids', 'Students', 'multi', activeStudents]]}
          onSave={saveSchedule} />
      </div>
      {made && <p className="note">{made}</p>}
      <div className="panel scroll">
        <h2>Recurring schedules</h2>
        <State rows={scheds} empty="No recurring schedules yet." />
        {scheds?.length > 0 && <table>
          <thead><tr><th>Course</th><th>Tutor</th><th>Days</th><th>Time</th><th>Runs</th><th>Students</th><th></th></tr></thead>
          <tbody>{scheds.map(s => (
            <tr key={s.id}><td><Lvl l={s.level} /> {s.title}</td><td>{s.profiles?.full_name || '–'}</td>
              <td>{s.weekdays.map(d => DAYS[d - 1]).join(', ')}</td><td>{s.start_time.slice(0, 5)}</td>
              <td>{s.start_date} → {dayStr(addDays(s.weeks * 7 - 1, new Date(s.start_date)))}</td><td>{s.student_ids.length}</td>
              <td className="actions"><button className="link alt" onClick={() => startEdit(s)}>Edit</button> <button className="link danger" onClick={() => endSchedule(s.id)}>End early</button></td></tr>))}</tbody>
        </table>}
      </div>
      <QuickForm title="One-off class (extra or make-up)" initial={{ duration_min: 90 }}
        fields={[['title', 'Topic'], ['level', 'Level', 'select', LEVELS], ['week_no', 'Week no.', 'number'],
          ['starts_at', 'Date and time (Lagos)', 'datetime-local'], ['duration_min', 'Duration (minutes)', 'number'],
          ['meet_url', 'Google Meet link', 'url'], ['tutor_id', 'Tutor', 'select', tutorOpts(tutors)], ['students', 'Students', 'multi', activeStudents]]}
        onSave={saveOne} />
    </Page>
  )
}

// ---------- Students ----------
const studentFields = tutors => [['full_name', 'Full name'], ['email', 'Email', 'email'], ['phone', 'Phone'], ['country', 'Country'],
  ['level', 'Level', 'select', LEVELS], ['goal', 'Goal', 'select', [['general', 'General French'], ['tcf', 'TCF prep']]],
  ['exam_date', 'TCF exam date', 'date', null, v => v.goal === 'tcf'], ['hours_per_week', 'Hours per week', 'number'], ['tutor_id', 'Tutor', 'select', tutorOpts(tutors)]]
const STUDENT_COLS = ['full_name', 'email', 'phone', 'country', 'level', 'goal', 'exam_date', 'hours_per_week', 'tutor_id']

export function AdminStudents() {
  const [tutors] = useTutors()
  const [students, err, reload] = useStudents()
  const [f, setF] = useState({})
  const [editing, setEditing] = useState(null)
  const update = async (id, patch) => { await sb.from('students').update(patch).eq('id', id); reload() }
  async function save(v) {
    const row = clean(Object.fromEntries(STUDENT_COLS.map(k => [k, v[k] ?? null])))
    if (row.goal !== 'tcf') row.exam_date = null
    const { error } = editing ? await sb.from('students').update(row).eq('id', editing.id) : await sb.from('students').insert(row)
    if (!error) setEditing(null)
    reload(); return error
  }
  const shown = (students || []).filter(s => (!f.tutor || s.tutor_id === f.tutor) && (!f.level || s.level === f.level) && (!f.status || s.status === f.status) && (!f.goal || s.goal === f.goal))

  return (
    <Page title="Students" sub="All students. Change a student's tutor from the list.">
      <div id="student-form">
        <QuickForm key={editing?.id || 'new'} title={editing ? `Edit ${editing.full_name}` : 'Add student'} fields={studentFields(tutors)}
          initial={editing ? Object.fromEntries(STUDENT_COLS.map(k => [k, editing[k] ?? ''])) : { goal: 'general' }}
          onCancel={editing ? () => setEditing(null) : null} onSave={save} />
      </div>
      <Filters v={f} set={setF} items={[['tutor', 'Tutor', 'select', tutorOpts(tutors, true)], ['level', 'Level', 'select', LEVELS],
        ['status', 'Status', 'select', ['active', 'paused', 'finished']], ['goal', 'Goal', 'select', [['general', 'General'], ['tcf', 'TCF prep']]]]} />
      <div className="panel scroll">
        <h2>Students ({shown.length})</h2>
        <State rows={students && shown} err={err} empty="No students match these filters." />
        {shown.length > 0 && <table>
          <thead><tr><th>Name</th><th>Level</th><th>Contact</th><th>Tutor</th><th>Attendance</th><th>Status</th><th></th></tr></thead>
          <tbody>{shown.map(s => {
            const a = attendance(s)
            return (
              <tr key={s.id}>
                <td><b>{s.full_name}</b><div className="meta">{s.country || ''}{s.goal === 'tcf' ? ` · TCF ${s.exam_date || ''}` : ''}</div></td>
                <td><Lvl l={s.level} /></td>
                <td className="meta">{s.email}<br />{s.phone}</td>
                <td><select aria-label="Tutor" value={s.tutor_id || ''} onChange={e => update(s.id, { tutor_id: e.target.value || null })}>
                  <option value="">Unassigned</option>{tutorOpts(tutors, true).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></td>
                <td>{a === null ? '–' : <div className="barwrap"><div className="bar"><i style={{ width: `${a}%` }} /></div>{a}%</div>}</td>
                <td><select aria-label="Status" value={s.status} onChange={e => update(s.id, { status: e.target.value })}>
                  {['active', 'paused', 'finished'].map(x => <option key={x}>{x}</option>)}</select></td>
                <td><button className="link alt" onClick={() => { setEditing(s); document.getElementById('student-form')?.scrollIntoView({ behavior: 'smooth' }) }}>Edit</button></td>
              </tr>)
          })}</tbody>
        </table>}
      </div>
    </Page>
  )
}

// ---------- Tutors ----------
export function AdminTutors({ me }) {
  const [team, err, reload] = useRows(() => sb.from('profiles').select('*').order('created_at'))
  const [students, , reloadStudents] = useRows(() => sb.from('students').select('tutor_id').eq('status', 'active'))
  const [upcoming, , reloadUpcoming] = useRows(() => sb.from('classes').select('tutor_id').gt('starts_at', new Date().toISOString()))
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const [reports] = useRows(() => sb.from('reports').select('tutor_id, duration_min').gte('created_at', monthStart.toISOString()))
  const [transfer, setTransfer] = useState(null) // { from, to }
  const [msg, setMsg] = useState('')
  const count = (rows, id) => (rows || []).filter(r => r.tutor_id === id).length
  const hours = id => (reports || []).filter(r => r.tutor_id === id).reduce((s, r) => s + (r.duration_min || 0), 0) / 60
  const update = async (id, patch) => { await sb.from('profiles').update(patch).eq('id', id); reload() }
  const tutors = (team || []).filter(t => t.role === 'tutor')

  async function doTransfer() {
    const { data, error } = await sb.rpc('transfer_tutor', { p_from: transfer.from.id, p_to: transfer.to })
    if (error) return setMsg(`Not moved: ${error.message}`)
    setMsg(`Moved ${data.students} students, ${data.schedules} schedules and ${data.classes} upcoming classes.`)
    setTransfer(null); reloadStudents(); reloadUpcoming()
  }

  return (
    <Page title="Tutors" sub="Your team, their workload, and access.">
      {msg && <p className="note">{msg}</p>}
      {transfer && (
        <div className="panel confirm">
          <h2>Move {transfer.from.full_name || 'this tutor'}'s work</h2>
          <p>Moves their current students, recurring schedules and upcoming classes to another tutor. Past classes and reports stay with {transfer.from.full_name || 'them'}.</p>
          <div className="field"><label htmlFor="tt">Move to</label>
            <select id="tt" value={transfer.to || ''} onChange={e => setTransfer({ ...transfer, to: e.target.value })}>
              <option value="">Choose a tutor…</option>
              {tutors.filter(t => t.active && t.id !== transfer.from.id).map(t => <option key={t.id} value={t.id}>{t.full_name || 'Unnamed tutor'}</option>)}
            </select></div>
          <div className="form-actions"><button className="btn" disabled={!transfer.to} onClick={doTransfer}>Move everything</button>
            <button className="btn ghost" onClick={() => setTransfer(null)}>Cancel</button></div>
        </div>
      )}
      <div className="panel scroll">
        <h2>Tutors ({tutors.length})</h2>
        <State rows={team && tutors} err={err} empty="No tutors yet." />
        {tutors.length > 0 && <table>
          <thead><tr><th>Name</th><th>Access</th><th>Students</th><th>Upcoming classes</th><th>Hours this month</th><th></th></tr></thead>
          <tbody>{tutors.map(t => (
            <tr key={t.id}>
              <td><input aria-label="Name" defaultValue={t.full_name || ''} placeholder="Add name" onBlur={e => e.target.value !== (t.full_name || '') && update(t.id, { full_name: e.target.value })} /></td>
              <td><span className={`pill ${t.active ? 'ok' : 'warn'}`}>{t.active ? 'Active' : 'Paused'}</span></td>
              <td>{count(students, t.id)}</td><td>{count(upcoming, t.id)}</td><td>{hours(t.id).toFixed(1)}</td>
              <td className="actions">
                <button className={`link ${t.active ? 'danger' : 'alt'}`} onClick={() => update(t.id, { active: !t.active })}>{t.active ? 'Pause access' : 'Resume access'}</button>
                <button className="link alt" onClick={() => { setMsg(''); setTransfer({ from: t, to: '' }) }}>Move students & classes</button>
              </td>
            </tr>))}</tbody>
        </table>}
        <p className="meta">Paused tutors can't see students, classes or the library, can't file reports, and get no notifications. Their data is kept, and resuming restores everything.</p>
      </div>
      <div className="panel scroll">
        <h2>Admins</h2>
        <table>
          <thead><tr><th>Name</th><th>Role</th></tr></thead>
          <tbody>{(team || []).filter(t => t.role === 'admin').map(t => (
            <tr key={t.id}><td><input aria-label="Name" defaultValue={t.full_name || ''} placeholder="Add name" onBlur={e => e.target.value !== (t.full_name || '') && update(t.id, { full_name: e.target.value })} /></td>
              <td>{t.id === me ? 'Admin (you)' : <select aria-label="Role" value={t.role} onChange={e => update(t.id, { role: e.target.value })}><option>admin</option><option>tutor</option></select>}</td></tr>))}</tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Add a tutor or admin</h2>
        <p>In Supabase, open <b>Authentication → Users → Add user → Create new user</b>, enter the email and a temporary password, and tick <b>Auto confirm</b>. New accounts appear above as tutors. Set their name so they show up in the student and class forms. To make someone an admin, change the role on their row.</p>
        {tutors.length > 0 && <p className="meta">Make a tutor an admin: <select aria-label="Promote tutor" value="" onChange={e => e.target.value && update(e.target.value, { role: 'admin' })}>
          <option value="">Choose a tutor…</option>{tutors.map(t => <option key={t.id} value={t.id}>{t.full_name || 'Unnamed tutor'}</option>)}</select></p>}
      </div>
    </Page>
  )
}

// ---------- Reports ----------
export function AdminReports() {
  const [tutors] = useTutors()
  const [f, setF] = useState({ from: dayStr(addDays(-30)), to: dayStr(new Date()) })
  const [rows, err] = useRows(() => sb.from('reports').select('*, classes(title, level, starts_at), profiles(full_name)').order('created_at', { ascending: false }).limit(300))
  const [recent] = useRecentClasses()
  const shown = (rows || []).filter(r => {
    const d = r.classes?.starts_at?.slice(0, 10) || r.created_at.slice(0, 10)
    return (!f.tutor || r.tutor_id === f.tutor) && (!f.level || r.classes?.level === f.level) && (!f.from || d >= f.from) && (!f.to || d <= f.to)
  })
  return (
    <Page title="Reports" sub="Every class report tutors have filed.">
      <MissingReports rows={recent} />
      <Filters v={f} set={setF} items={[['tutor', 'Tutor', 'select', tutorOpts(tutors, true)], ['level', 'Level', 'select', LEVELS], ['from', 'From', 'date'], ['to', 'To', 'date']]} />
      <div className="panel">
        <h2>Reports ({shown.length})</h2>
        <State rows={rows && shown} err={err} empty="No reports match these filters." />
        <div className="list">{shown.map(r => (
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
    </Page>
  )
}

// ---------- Payments ----------
export function AdminPayments() {
  const [students] = useStudents()
  const [rows, err, reload] = useRows(() => sb.from('payments').select('*, students(full_name)').order('created_at', { ascending: false }))
  const [f, setF] = useState({})
  const shown = (rows || []).filter(p => (!f.student || p.student_id === f.student) && (!f.status || p.status === f.status) && (!f.month || p.period_month?.slice(0, 7) === f.month))
  const totals = shown.filter(p => p.status === 'paid').reduce((m, p) => ({ ...m, [p.currency]: (m[p.currency] || 0) + Number(p.amount) }), {})
  const studentOpts = (students || []).map(s => [s.id, s.full_name])
  return (
    <Page title="Payments" sub="Log and track student payments.">
      <QuickForm title="Log payment" initial={{ currency: 'NGN', status: 'paid', method: 'paystack' }}
        fields={[['student_id', 'Student', 'select', studentOpts], ['amount', 'Amount', 'number'],
          ['currency', 'Currency', 'select', ['NGN', 'USD']], ['method', 'Method', 'select', [['paystack', 'Paystack'], ['paypal', 'PayPal'], ['transfer', 'Bank transfer']]],
          ['reference', 'Reference'], ['period_month', 'For month', 'month'], ['status', 'Status', 'select', ['paid', 'pending', 'failed']]]}
        onSave={async v => {
          const row = clean({ ...v, period_month: v.period_month ? `${v.period_month}-01` : null, paid_at: v.status === 'paid' ? new Date().toISOString() : null })
          const { error } = await sb.from('payments').insert(row); reload(); return error
        }} />
      <Filters v={f} set={setF} items={[['student', 'Student', 'select', studentOpts], ['month', 'Month', 'month'], ['status', 'Status', 'select', ['paid', 'pending', 'failed']]]} />
      <div className="panel scroll">
        <h2>Payments ({shown.length})</h2>
        <p className="meta">Total paid: {Object.entries(totals).map(([c, n]) => money(n, c)).join(' · ') || 'none'}</p>
        <State rows={rows && shown} err={err} empty="No payments match these filters." />
        {shown.length > 0 && <table>
          <thead><tr><th>Student</th><th>Amount</th><th>Method</th><th>Month</th><th>Status</th></tr></thead>
          <tbody>{shown.map(p => (
            <tr key={p.id}><td>{p.students?.full_name}</td><td>{money(p.amount, p.currency)}</td><td>{p.method}</td>
              <td>{p.period_month?.slice(0, 7) || '–'}</td>
              <td><select aria-label="Status" className={`pill ${p.status === 'paid' ? 'ok' : p.status === 'pending' ? 'warn' : 'bad'}`} value={p.status}
                onChange={async e => { await sb.from('payments').update({ status: e.target.value, paid_at: e.target.value === 'paid' ? new Date().toISOString() : null }).eq('id', p.id); reload() }}>
                {['paid', 'pending', 'failed'].map(x => <option key={x}>{x}</option>)}</select></td></tr>))}</tbody>
        </table>}
      </div>
    </Page>
  )
}

// ---------- Library ----------
const RES_COLS = ['title', 'level', 'skill', 'source', 'url']
export function AdminLibrary() {
  const [rows, err, reload] = useRows(() => sb.from('resources').select('*').order('level').order('title'))
  const [editing, setEditing] = useState(null)
  async function save(v) {
    const row = clean(Object.fromEntries(RES_COLS.map(k => [k, v[k] ?? null])))
    const { error } = editing ? await sb.from('resources').update(row).eq('id', editing.id) : await sb.from('resources').insert(row)
    if (!error) setEditing(null)
    reload(); return error
  }
  return (
    <Page title="Library" sub="Free resources tutors use in class.">
      <div id="res-form">
        <QuickForm key={editing?.id || 'new'} title={editing ? `Edit ${editing.title}` : 'Add resource'}
          initial={editing ? Object.fromEntries(RES_COLS.map(k => [k, editing[k] ?? ''])) : { skill: 'Listening' }} onCancel={editing ? () => setEditing(null) : null}
          fields={[['title', 'Title'], ['level', 'Level', 'select', LEVELS], ['skill', 'Skill', 'select', SKILLS], ['source', 'Source (e.g. TV5Monde)'], ['url', 'Link', 'url']]}
          onSave={save} />
      </div>
      <div className="panel scroll">
        <h2>Resources ({rows?.length ?? 0})</h2>
        <State rows={rows} err={err} empty="No resources yet." />
        {rows?.length > 0 && <table>
          <thead><tr><th>Title</th><th>Level</th><th>Skill</th><th>Source</th><th></th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}><td><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a></td><td><Lvl l={r.level} /></td><td>{r.skill}</td><td>{r.source}</td>
              <td className="actions"><button className="link alt" onClick={() => { setEditing(r); document.getElementById('res-form')?.scrollIntoView({ behavior: 'smooth' }) }}>Edit</button>
                <button className="link danger" onClick={async () => { await sb.from('resources').delete().eq('id', r.id); reload() }}>Remove</button></td></tr>))}</tbody>
        </table>}
      </div>
    </Page>
  )
}
