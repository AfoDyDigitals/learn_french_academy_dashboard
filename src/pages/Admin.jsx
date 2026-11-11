import { useState } from 'react'
import { Link } from 'react-router-dom'
import { sb } from '../supabase'
import { useRows, Lvl, fmtDay, fmtTime, State } from '../ui'
import { PageHeader, AddButton, Tabs, Sheet, Toolbar, Table, ConfirmButton, toast } from '../components'

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'TCF']
const SKILLS = ['Listening', 'Speaking', 'Reading', 'Writing', 'Grammar']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Class times are entered and shown in Lagos time (UTC+1, no daylight saving)
const lagosToISO = v => new Date(`${v}:00+01:00`).toISOString()
const clean = o => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, x === '' ? null : x]))
const addDays = (n, d = new Date()) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const money = (n, c) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n)
const ended = c => new Date(c.starts_at).getTime() + c.duration_min * 60000 < Date.now()
const has = (q, ...vals) => !q || vals.some(v => (v || '').toLowerCase().includes(q.toLowerCase()))

// Shared data
const useTutors = () => useRows(() => sb.from('profiles').select('id, full_name, role, active').eq('role', 'tutor').order('full_name'))
const useStudents = () => useRows(() => sb.from('students').select('*, profiles(full_name), class_students(attended)').order('full_name'))
const tutorOpts = (tutors, all = false) => (tutors || []).filter(t => all || t.active)
  .map(t => [t.id, `${t.full_name || 'Unnamed tutor'}${t.active ? '' : ' (paused)'}`])
const attendance = s => {
  const marked = (s.class_students || []).filter(c => c.attended !== null)
  return marked.length ? Math.round(100 * marked.filter(c => c.attended).length / marked.length) : null
}
const Bar = ({ pct }) => pct === null ? <span className="meta">–</span> : <div className="barwrap"><div className="bar"><i style={{ width: `${pct}%` }} /></div>{pct}%</div>

// Form used inside sheets: fields = [[key, label, type, options?, show?(values), hint?]]
function Form({ fields, onSave, initial = {}, submit = 'Save', onDone }) {
  const [v, setV] = useState(initial)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function go(e) {
    e.preventDefault(); setBusy(true); setMsg('')
    const error = await onSave(v)
    setBusy(false)
    if (error) return setMsg(error.message)
    onDone?.()
  }
  const toggle = (k, id, on) => setV({ ...v, [k]: on ? [...(v[k] || []), id] : (v[k] || []).filter(x => x !== id) })
  return (
    <form className="form" onSubmit={go}>
      {fields.filter(f => !f[4] || f[4](v)).map(([k, label, type = 'text', opts, , hint]) => (
        <div className={`field ${['days', 'multi'].includes(type) ? 'wide' : ''}`} key={k}>
          <label htmlFor={`f-${k}`}>{label}</label>
          {type === 'select' ? (
            <select id={`f-${k}`} value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })}>
              <option value="">Choose…</option>
              {opts.map(o => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o}>{o}</option>)}
            </select>
          ) : type === 'days' ? (
            <div className="day-pick">{DAYS.map((d, i) => (
              <label key={d} className={`day ${(v[k] || []).includes(i + 1) ? 'on' : ''}`}>
                <input type="checkbox" checked={(v[k] || []).includes(i + 1)} onChange={e => toggle(k, i + 1, e.target.checked)} />{d}</label>
            ))}</div>
          ) : type === 'multi' ? (
            <div className="multi">{opts.length ? opts.map(([id, name]) => (
              <label key={id} className="check"><input type="checkbox" checked={(v[k] || []).includes(id)} onChange={e => toggle(k, id, e.target.checked)} /> {name}</label>
            )) : <span className="meta">No active students yet.</span>}</div>
          ) : (
            <input id={`f-${k}`} type={type} value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} />
          )}
          {hint && <small className="hint">{hint}</small>}
        </div>
      ))}
      {msg && <p className="note bad">Not saved: {msg}</p>}
      <div className="form-actions"><button className="btn" disabled={busy}>{busy ? 'Saving…' : submit}</button></div>
    </form>
  )
}

function MissingList({ rows }) {
  const missing = (rows || []).filter(c => ended(c) && !c.reports.length)
  if (!rows) return <p className="empty">Loading…</p>
  if (!missing.length) return <p className="empty">Every finished class in the last 14 days has a report.</p>
  return <div className="list">{missing.map(c => (
    <div className="row" key={c.id}><Lvl l={c.level} />
      <div className="grow"><b>{c.title}</b><div className="meta">{fmtDay(c.starts_at)} {fmtTime(c.starts_at)} · {c.profiles?.full_name || 'No tutor'}</div></div>
      <span className="pill bad">No report</span></div>))}</div>
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
  const missing = (recent || []).filter(c => ended(c) && !c.reports.length).length
  const Stat = ({ to, k, v, n, tone }) => <Link to={to} className={`panel stat link-card ${tone || ''}`}><div className="k">{k}</div><div className="v">{v ?? '–'}</div>{n && <div className="n">{n}</div>}</Link>

  return (
    <section>
      <PageHeader title={`Bonjour, ${name.split(' ')[0]}`} sub={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} />
      <div className="stats">
        <Stat to="/classes" k="Classes today" v={today?.length} n={`${week?.length ?? 0} in the next 7 days · ${hours} h`} />
        <Stat to="/students" k="Active students" v={students?.length} />
        <Stat to="/tutors" k="Active tutors" v={tutors?.filter(t => t.active).length} n={`${tutors?.filter(t => !t.active).length || 0} paused`} />
        <Stat to="/reports" k="Missing reports" v={recent ? missing : null} n="Last 14 days" tone={missing ? 'alert' : ''} />
      </div>
      <div className="grid cols-2">
        <div className="panel">
          <div className="panel-head"><h2>Today's classes</h2><Link to="/classes" className="link alt">All classes</Link></div>
          <State rows={today} err={err} empty="No classes today." />
          <div className="list">{today?.map(c => (
            <div className="row" key={c.id}><span className="time">{fmtTime(c.starts_at)}</span><Lvl l={c.level} />
              <div className="grow"><b>{c.title}</b><div className="meta">{c.profiles?.full_name || 'No tutor'} · {c.duration_min} min</div></div>
              {c.meet_url && <a className="pill info" href={c.meet_url} target="_blank" rel="noreferrer">Meet</a>}</div>))}</div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Missing reports</h2><Link to="/reports" className="link alt">All reports</Link></div>
          <MissingList rows={recent} />
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Payments to follow up</h2><Link to="/payments" className="link alt">All payments</Link></div>
          <State rows={pays} empty="No pending or failed payments." />
          <div className="list">{pays?.map(p => (
            <div className="row" key={p.id}><div className="grow"><b>{p.students?.full_name}</b><div className="meta">{money(p.amount, p.currency)} · {p.period_month?.slice(0, 7) || 'no month set'}</div></div>
              <span className={`pill ${p.status === 'pending' ? 'warn' : 'bad'}`}>{p.status}</span></div>))}</div>
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Latest reports</h2><Link to="/reports" className="link alt">See all</Link></div>
          <State rows={reports} empty="No reports yet." />
          <div className="list">{reports?.map(r => (
            <div className="row" key={r.id}>{r.classes && <Lvl l={r.classes.level} />}
              <div className="grow"><b>{r.classes?.title}</b><div className="meta">{r.profiles?.full_name} · {r.classes && fmtDay(r.classes.starts_at)}</div></div></div>))}</div>
        </div>
      </div>
    </section>
  )
}

// ---------- Classes ----------
const RANGES = [['upcoming', 'Next 14 days'], ['today', 'Today'], ['week', 'Next 7 days'], ['past', 'Past 14 days'], ['month', 'Next 30 days']]
const rangeDates = r => ({ today: [0, 1], week: [0, 7], upcoming: [0, 14], past: [-14, 0], month: [0, 30] }[r])

export function AdminClasses() {
  const [tutors] = useTutors()
  const [students] = useStudents()
  const [tab, setTab] = useState('classes')
  const [q, setQ] = useState('')
  const defaults = { range: 'upcoming' }
  const [f, setF] = useState(defaults)
  const [rows, err, reload] = useRows(() => {
    const [a, b] = rangeDates(f.range || 'upcoming')
    const from = new Date(); from.setHours(0, 0, 0, 0)
    let qy = sb.from('classes').select('*, profiles(full_name), class_students(student_id)')
      .gte('starts_at', addDays(a, from).toISOString()).lt('starts_at', addDays(b, from).toISOString()).order('starts_at', { ascending: f.range !== 'past' })
    if (f.tutor) qy = qy.eq('tutor_id', f.tutor)
    if (f.level) qy = qy.eq('level', f.level)
    return qy
  }, [f.range, f.tutor, f.level])
  const [scheds, , reloadScheds] = useRows(() => sb.from('schedules').select('*, profiles(full_name)').order('start_date', { ascending: false }))
  const activeStudents = (students || []).filter(s => s.status === 'active').map(s => [s.id, `${s.full_name} (${s.level})`])
  const [sheet, setSheet] = useState(null) // 'schedule' | 'oneoff' | schedule object being edited

  async function saveOne(v) {
    const { students: ids = [], starts_at, ...rest } = v
    if (!starts_at) return { message: 'Pick a date and time.' }
    const { data, error } = await sb.from('classes').insert(clean({ ...rest, starts_at: lagosToISO(starts_at) })).select('id').single()
    if (error) return error
    if (ids.length) { const r = await sb.from('class_students').insert(ids.map(student_id => ({ class_id: data.id, student_id }))); if (r.error) return r.error }
    toast('Class added'); reload()
  }
  const editing = typeof sheet === 'object' && sheet
  async function saveSchedule(v) {
    if (!v.weekdays?.length) return { message: 'Pick at least one class day.' }
    const p = { ...v, student_ids: v.student_ids || [] }
    const { data, error } = editing ? await sb.rpc('update_schedule', { p_id: editing.id, p }) : await sb.rpc('create_schedule', { p })
    if (error) return error
    toast(editing ? `Schedule updated · ${data} upcoming classes rebuilt` : `Schedule created · ${data} classes added`)
    reload(); reloadScheds(); setTab('schedules')
  }
  const endSchedule = async id => { await sb.rpc('end_schedule', { p_id: id }); toast('Schedule ended · upcoming classes removed'); reload(); reloadScheds() }
  const reassign = async (id, tutor_id) => { await sb.from('classes').update({ tutor_id: tutor_id || null, reminded_at: null }).eq('id', id); toast('Tutor changed'); reload() }
  const remove = async id => { await sb.from('classes').delete().eq('id', id); toast('Class removed'); reload() }
  const shownClasses = (rows || []).filter(c => has(q, c.title, c.profiles?.full_name))
  const shownScheds = (scheds || []).filter(s => has(q, s.title, s.profiles?.full_name) && (!f.tutor || s.tutor_id === f.tutor) && (!f.level || s.level === f.level))
  const tutorSelect = (value, onChange) => (
    <select aria-label="Tutor" className="inline-select" value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">No tutor</option>{tutorOpts(tutors, true).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
  )

  return (
    <section>
      <PageHeader title="Classes" sub="All tutors' classes and recurring schedules. Times are Lagos time.">
        <AddButton ghost onClick={() => setSheet('oneoff')}>One-off class</AddButton>
        <AddButton onClick={() => setSheet('schedule')}>New schedule</AddButton>
      </PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[['classes', `Classes${rows ? ` (${shownClasses.length})` : ''}`], ['schedules', `Schedules${scheds ? ` (${shownScheds.length})` : ''}`]]} />
      <Toolbar search={q} onSearch={setQ} placeholder={tab === 'classes' ? 'Search class or tutor' : 'Search schedule or tutor'} values={f} onChange={setF} defaults={defaults}
        filters={[...(tab === 'classes' ? [['range', 'When', 'select', RANGES]] : []), ['tutor', 'Tutor', 'select', tutorOpts(tutors, true)], ['level', 'Level', 'select', LEVELS]]} />
      {tab === 'classes' ? (
        <div className="panel flush">
          <State rows={rows && shownClasses} err={err} empty="No classes match. Try a different date range or clear the filters." />
          {shownClasses.length > 0 && <Table head={['Class', 'When', 'Tutor', 'Students', '']} rows={shownClasses.map(c => ({
            key: c.id, cells: [
              <span className="cell-title"><Lvl l={c.level} /> {c.title}</span>,
              <span className="nowrap">{fmtDay(c.starts_at)} · {fmtTime(c.starts_at)}</span>,
              tutorSelect(c.tutor_id, v => reassign(c.id, v)),
              c.class_students.length,
              <span className="actions">{c.meet_url && <a className="link alt" href={c.meet_url} target="_blank" rel="noreferrer">Meet</a>}<ConfirmButton onConfirm={() => remove(c.id)}>Remove</ConfirmButton></span>,
            ] }))} />}
        </div>
      ) : (
        <div className="panel flush">
          <State rows={scheds && shownScheds} empty="No recurring schedules yet. Create one when a contract starts." />
          {shownScheds.length > 0 && <Table head={['Course', 'Tutor', 'Days', 'Time', 'Runs', 'Students', '']} rows={shownScheds.map(s => ({
            key: s.id, cells: [
              <span className="cell-title"><Lvl l={s.level} /> {s.title}</span>,
              s.profiles?.full_name || '–',
              s.weekdays.map(d => DAYS[d - 1]).join(', '),
              s.start_time.slice(0, 5),
              <span className="nowrap">{fmtDay(s.start_date)} → {fmtDay(addDays(s.weeks * 7 - 1, new Date(s.start_date)))}</span>,
              s.student_ids.length,
              <span className="actions"><button className="link alt" onClick={() => setSheet({ ...s, start_time: s.start_time.slice(0, 5), meet_url: s.meet_url || '', tutor_id: s.tutor_id || '' })}>Edit</button>
                <ConfirmButton onConfirm={() => endSchedule(s.id)}>End early</ConfirmButton></span>,
            ] }))} />}
        </div>
      )}
      <Sheet open={sheet === 'schedule' || !!editing} title={editing ? `Edit ${editing.title}` : 'New recurring schedule'} onClose={() => setSheet(null)}>
        <p className="sheet-intro">{editing ? 'Changes apply from now on. Past classes and reports stay as they are.' : 'Set once when a contract starts. Every class for the contract is created at once.'}</p>
        <Form key={editing?.id || 'new'} initial={editing || { duration_min: 90, weeks: 8, weekdays: [] }} onDone={() => setSheet(null)} submit={editing ? 'Save changes' : 'Create schedule'}
          fields={[['title', 'Course name', 'text', null, null, 'For example: A1 Evening'], ['level', 'Level', 'select', LEVELS], ['tutor_id', 'Tutor', 'select', tutorOpts(tutors)],
            ['weekdays', 'Class days', 'days'], ['start_time', 'Start time (Lagos)', 'time'], ['duration_min', 'Length (minutes)', 'number'],
            ['start_date', 'Contract start date', 'date'], ['weeks', 'Contract length (weeks)', 'number'], ['meet_url', 'Google Meet link', 'url', null, null, 'Used for every class in this schedule'],
            ['student_ids', 'Students', 'multi', activeStudents]]}
          onSave={saveSchedule} />
      </Sheet>
      <Sheet open={sheet === 'oneoff'} title="One-off class" onClose={() => setSheet(null)}>
        <p className="sheet-intro">For an extra or make-up session outside a schedule.</p>
        <Form initial={{ duration_min: 90 }} onDone={() => setSheet(null)} submit="Add class"
          fields={[['title', 'Topic'], ['level', 'Level', 'select', LEVELS], ['starts_at', 'Date and time (Lagos)', 'datetime-local'], ['duration_min', 'Length (minutes)', 'number'],
            ['tutor_id', 'Tutor', 'select', tutorOpts(tutors)], ['meet_url', 'Google Meet link', 'url'], ['week_no', 'Week number (optional)', 'number'], ['students', 'Students', 'multi', activeStudents]]}
          onSave={saveOne} />
      </Sheet>
    </section>
  )
}

// ---------- Students ----------
const STUDENT_COLS = ['full_name', 'email', 'phone', 'country', 'level', 'goal', 'exam_date', 'hours_per_week', 'tutor_id']
export function AdminStudents() {
  const [tutors] = useTutors()
  const [students, err, reload] = useStudents()
  const [q, setQ] = useState('')
  const defaults = { status: 'active' }
  const [f, setF] = useState(defaults)
  const [sheet, setSheet] = useState(null) // 'new' | student
  const update = async (id, patch, msg) => { await sb.from('students').update(patch).eq('id', id); toast(msg); reload() }
  async function save(v) {
    const row = clean(Object.fromEntries(STUDENT_COLS.map(k => [k, v[k] ?? null])))
    if (row.goal !== 'tcf') row.exam_date = null
    const { error } = sheet === 'new' ? await sb.from('students').insert(row) : await sb.from('students').update(row).eq('id', sheet.id)
    if (!error) { toast(sheet === 'new' ? 'Student added' : 'Student updated'); reload() }
    return error
  }
  const shown = (students || []).filter(s => has(q, s.full_name, s.email, s.phone, s.country) && (!f.tutor || s.tutor_id === f.tutor) && (!f.level || s.level === f.level) && (!f.status || s.status === f.status) && (!f.goal || s.goal === f.goal))

  return (
    <section>
      <PageHeader title="Students" sub="Everyone enrolled. Change a student's tutor or status straight from the list.">
        <AddButton onClick={() => setSheet('new')}>Add student</AddButton>
      </PageHeader>
      <Toolbar search={q} onSearch={setQ} placeholder="Search name, email, phone or country" values={f} onChange={setF} defaults={defaults}
        filters={[['status', 'Status', 'select', [['active', 'Active'], ['paused', 'Paused'], ['finished', 'Finished'], ['', 'Any status']]],
          ['tutor', 'Tutor', 'select', tutorOpts(tutors, true)], ['level', 'Level', 'select', LEVELS], ['goal', 'Goal', 'select', [['general', 'General French'], ['tcf', 'TCF prep']]]]} />
      <div className="panel flush">
        <State rows={students && shown} err={err} empty="No students match. Clear the filters or add a student." />
        {shown.length > 0 && <Table head={['Student', 'Level', 'Contact', 'Tutor', 'Attendance', 'Status', '']} rows={shown.map(s => ({
          key: s.id, cells: [
            <span className="cell-title"><b>{s.full_name}</b><small className="meta">{[s.country, s.goal === 'tcf' && `TCF ${s.exam_date ? fmtDay(s.exam_date) : ''}`].filter(Boolean).join(' · ')}</small></span>,
            <Lvl l={s.level} />,
            <span className="meta">{s.email}{s.email && s.phone && <br />}{s.phone}</span>,
            <select aria-label="Tutor" className="inline-select" value={s.tutor_id || ''} onChange={e => update(s.id, { tutor_id: e.target.value || null }, 'Tutor changed')}>
              <option value="">Unassigned</option>{tutorOpts(tutors, true).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>,
            <Bar pct={attendance(s)} />,
            <select aria-label="Status" className="inline-select" value={s.status} onChange={e => update(s.id, { status: e.target.value }, 'Status changed')}>
              {['active', 'paused', 'finished'].map(x => <option key={x}>{x}</option>)}</select>,
            <button className="link alt" onClick={() => setSheet(s)}>Edit</button>,
          ] }))} />}
      </div>
      <Sheet open={!!sheet} title={sheet === 'new' ? 'Add student' : `Edit ${sheet?.full_name}`} onClose={() => setSheet(null)}>
        <Form key={sheet?.id || 'new'} onDone={() => setSheet(null)} submit={sheet === 'new' ? 'Add student' : 'Save changes'}
          initial={sheet && sheet !== 'new' ? Object.fromEntries(STUDENT_COLS.map(k => [k, sheet[k] ?? ''])) : { goal: 'general' }}
          fields={[['full_name', 'Full name'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'], ['country', 'Country'],
            ['level', 'Level', 'select', LEVELS], ['goal', 'Goal', 'select', [['general', 'General French'], ['tcf', 'TCF prep']]],
            ['exam_date', 'TCF exam date', 'date', null, v => v.goal === 'tcf'], ['hours_per_week', 'Hours per week', 'number'], ['tutor_id', 'Tutor', 'select', tutorOpts(tutors)]]}
          onSave={save} />
      </Sheet>
    </section>
  )
}

// ---------- Tutors ----------
export function AdminTutors({ me }) {
  const [team, err, reload] = useRows(() => sb.from('profiles').select('*').order('created_at'))
  const [students, , reloadStudents] = useRows(() => sb.from('students').select('tutor_id').eq('status', 'active'))
  const [upcoming, , reloadUpcoming] = useRows(() => sb.from('classes').select('tutor_id').gt('starts_at', new Date().toISOString()))
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const [reports] = useRows(() => sb.from('reports').select('tutor_id, duration_min').gte('created_at', monthStart.toISOString()))
  const [q, setQ] = useState('')
  const [f, setF] = useState({})
  const [transfer, setTransfer] = useState(null) // { from, to }
  const [help, setHelp] = useState(false)
  const count = (rows, id) => (rows || []).filter(r => r.tutor_id === id).length
  const hours = id => (reports || []).filter(r => r.tutor_id === id).reduce((s, r) => s + (r.duration_min || 0), 0) / 60
  const update = async (id, patch, msg) => { await sb.from('profiles').update(patch).eq('id', id); if (msg) toast(msg); reload() }
  const tutors = (team || []).filter(t => t.role === 'tutor')
  const shown = tutors.filter(t => has(q, t.full_name) && (!f.access || (f.access === 'active') === t.active))

  async function doTransfer() {
    const { data, error } = await sb.rpc('transfer_tutor', { p_from: transfer.from.id, p_to: transfer.to })
    if (error) return toast(`Not moved: ${error.message}`)
    toast(`Moved ${data.students} students, ${data.schedules} schedules, ${data.classes} classes`)
    setTransfer(null); reloadStudents(); reloadUpcoming()
  }
  const nameInput = t => <input aria-label="Name" className="inline-input" defaultValue={t.full_name || ''} placeholder="Add name"
    onBlur={e => e.target.value !== (t.full_name || '') && update(t.id, { full_name: e.target.value }, 'Name saved')} />

  return (
    <section>
      <PageHeader title="Tutors" sub={`Workload and access for your team. Hours come from class reports filed this month.`}>
        <AddButton onClick={() => setHelp(true)}>Add a tutor</AddButton>
      </PageHeader>
      <Toolbar search={q} onSearch={setQ} placeholder="Search tutors" values={f} onChange={setF} filters={[['access', 'Access', 'select', [['active', 'Active'], ['paused', 'Paused']]]]} />
      <div className="panel flush">
        <State rows={team && shown} err={err} empty="No tutors match." />
        {shown.length > 0 && <Table head={['Tutor', 'Access', 'Students', 'Upcoming classes', 'Hours this month', '']} rows={shown.map(t => ({
          key: t.id, cells: [
            nameInput(t),
            <span className={`pill ${t.active ? 'ok' : 'warn'}`}>{t.active ? 'Active' : 'Paused'}</span>,
            count(students, t.id), count(upcoming, t.id), hours(t.id).toFixed(1),
            <span className="actions">
              <button className="link alt" onClick={() => setTransfer({ from: t, to: '' })}>Move work</button>
              {t.active ? <ConfirmButton ask="Tap again to pause" onConfirm={() => update(t.id, { active: false }, `${t.full_name || 'Tutor'} paused`)}>Pause</ConfirmButton>
                : <button className="link alt" onClick={() => update(t.id, { active: true }, `${t.full_name || 'Tutor'} resumed`)}>Resume</button>}
            </span>,
          ] }))} />}
      </div>
      <p className="meta footnote">Paused tutors can't see students, classes or the library, can't file reports, and get no notifications. Nothing is deleted; resuming restores everything.</p>

      <div className="panel flush">
        <div className="panel-head pad"><h2>Admins</h2></div>
        <Table head={['Admin', 'Role']} rows={(team || []).filter(t => t.role === 'admin').map(t => ({
          key: t.id, cells: [nameInput(t), t.id === me ? <span className="meta">You</span>
            : <ConfirmButton className="link alt" ask="Tap again to make tutor" onConfirm={() => update(t.id, { role: 'tutor' }, 'Changed to tutor')}>Make tutor</ConfirmButton>] }))} />
      </div>

      <Sheet open={!!transfer} title={`Move ${transfer?.from.full_name || 'tutor'}'s work`} onClose={() => setTransfer(null)}>
        <p className="sheet-intro">Moves their current students, recurring schedules and upcoming classes to another tutor. Past classes and reports stay with {transfer?.from.full_name || 'them'}.</p>
        <div className="form">
          <div className="field"><label htmlFor="tt">Move to</label>
            <select id="tt" value={transfer?.to || ''} onChange={e => setTransfer({ ...transfer, to: e.target.value })}>
              <option value="">Choose a tutor…</option>
              {tutors.filter(t => t.active && t.id !== transfer?.from.id).map(t => <option key={t.id} value={t.id}>{t.full_name || 'Unnamed tutor'}</option>)}
            </select></div>
          <div className="form-actions"><button className="btn" disabled={!transfer?.to} onClick={doTransfer}>Move everything</button></div>
        </div>
      </Sheet>
      <Sheet open={help} title="Add a tutor" onClose={() => setHelp(false)}>
        <ol className="steps">
          <li>In Supabase, open <b>Authentication → Users</b>.</li>
          <li>Click <b>Add user → Create new user</b>, enter their email and a temporary password, and tick <b>Auto confirm</b>.</li>
          <li>They appear in this list as a tutor. Type their name in the list so they show up in student and class forms.</li>
          <li>Share the dashboard address and their temporary password. They can change it under <b>Account</b>.</li>
        </ol>
        {tutors.length > 0 && <div className="form"><div className="field"><label htmlFor="promote">Make an existing tutor an admin</label>
          <select id="promote" value="" onChange={e => { if (e.target.value) { update(e.target.value, { role: 'admin' }, 'Now an admin'); setHelp(false) } }}>
            <option value="">Choose a tutor…</option>{tutors.map(t => <option key={t.id} value={t.id}>{t.full_name || 'Unnamed tutor'}</option>)}</select></div></div>}
      </Sheet>
    </section>
  )
}

// ---------- Reports ----------
export function AdminReports() {
  const [tutors] = useTutors()
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [f, setF] = useState({})
  const [rows, err] = useRows(() => sb.from('reports').select('*, classes(title, level, starts_at), profiles(full_name)').order('created_at', { ascending: false }).limit(300))
  const [recent] = useRecentClasses()
  const missing = (recent || []).filter(c => ended(c) && !c.reports.length).length
  const shown = (rows || []).filter(r => {
    const d = r.classes?.starts_at?.slice(0, 10) || r.created_at.slice(0, 10)
    return has(q, r.classes?.title, r.covered, r.homework, r.notes, r.profiles?.full_name)
      && (!f.tutor || r.tutor_id === f.tutor) && (!f.level || r.classes?.level === f.level) && (!f.from || d >= f.from) && (!f.to || d <= f.to)
  })
  return (
    <section>
      <PageHeader title="Reports" sub="What tutors covered in each class." />
      <Tabs value={tab} onChange={setTab} tabs={[['all', `All reports${rows ? ` (${shown.length})` : ''}`], ['missing', `Missing${recent ? ` (${missing})` : ''}`]]} />
      {tab === 'missing' ? <div className="panel"><MissingList rows={recent} /></div> : <>
        <Toolbar search={q} onSearch={setQ} placeholder="Search topic, notes or tutor" values={f} onChange={setF}
          filters={[['tutor', 'Tutor', 'select', tutorOpts(tutors, true)], ['level', 'Level', 'select', LEVELS], ['from', 'From', 'date'], ['to', 'To', 'date']]} />
        <div className="panel">
          <State rows={rows && shown} err={err} empty="No reports match these filters." />
          <div className="list">{shown.map(r => (
            <article className="row report" key={r.id}>
              {r.classes && <Lvl l={r.classes.level} />}
              <div className="grow">
                <div className="report-head"><b>{r.classes?.title}</b><span className="meta">{r.classes && fmtDay(r.classes.starts_at)} · {r.profiles?.full_name}{r.duration_min ? ` · ${r.duration_min} min` : ''}</span></div>
                <p>{r.covered}</p>
                {r.homework && <p className="meta">Homework: {r.homework}</p>}
                {r.notes && <p className="note">{r.notes}</p>}
              </div>
            </article>))}</div>
        </div>
      </>}
    </section>
  )
}

// ---------- Payments ----------
export function AdminPayments() {
  const [students] = useStudents()
  const [rows, err, reload] = useRows(() => sb.from('payments').select('*, students(full_name)').order('created_at', { ascending: false }))
  const [q, setQ] = useState('')
  const [f, setF] = useState({})
  const [open, setOpen] = useState(false)
  const shown = (rows || []).filter(p => has(q, p.students?.full_name, p.reference) && (!f.status || p.status === f.status) && (!f.month || p.period_month?.slice(0, 7) === f.month) && (!f.currency || p.currency === f.currency))
  const sum = (st, c) => shown.filter(p => p.status === st && p.currency === c).reduce((s, p) => s + Number(p.amount), 0)
  const setStatus = async (p, status) => { await sb.from('payments').update({ status, paid_at: status === 'paid' ? new Date().toISOString() : null }).eq('id', p.id); toast(`Marked ${status}`); reload() }
  return (
    <section>
      <PageHeader title="Payments" sub="Every payment logged, with totals for what's shown.">
        <AddButton onClick={() => setOpen(true)}>Log payment</AddButton>
      </PageHeader>
      <div className="stats">
        <div className="panel stat"><div className="k">Paid (NGN)</div><div className="v sm">{money(sum('paid', 'NGN'), 'NGN')}</div></div>
        <div className="panel stat"><div className="k">Paid (USD)</div><div className="v sm">{money(sum('paid', 'USD'), 'USD')}</div></div>
        <div className="panel stat"><div className="k">Pending</div><div className="v sm">{shown.filter(p => p.status === 'pending').length}</div></div>
        <div className="panel stat"><div className="k">Failed</div><div className="v sm">{shown.filter(p => p.status === 'failed').length}</div></div>
      </div>
      <Toolbar search={q} onSearch={setQ} placeholder="Search student or reference" values={f} onChange={setF}
        filters={[['status', 'Status', 'select', [['paid', 'Paid'], ['pending', 'Pending'], ['failed', 'Failed']]], ['month', 'For month', 'month'], ['currency', 'Currency', 'select', ['NGN', 'USD']]]} />
      <div className="panel flush">
        <State rows={rows && shown} err={err} empty="No payments match. Clear the filters or log a payment." />
        {shown.length > 0 && <Table head={['Student', 'Amount', 'Method', 'For month', 'Status']} rows={shown.map(p => ({
          key: p.id, cells: [
            <span className="cell-title"><b>{p.students?.full_name}</b>{p.reference && <small className="meta">Ref {p.reference}</small>}</span>,
            <b className="num">{money(p.amount, p.currency)}</b>, p.method, p.period_month?.slice(0, 7) || '–',
            <select aria-label="Status" className={`inline-select pill ${p.status === 'paid' ? 'ok' : p.status === 'pending' ? 'warn' : 'bad'}`} value={p.status} onChange={e => setStatus(p, e.target.value)}>
              {['paid', 'pending', 'failed'].map(x => <option key={x}>{x}</option>)}</select>,
          ] }))} />}
      </div>
      <Sheet open={open} title="Log payment" onClose={() => setOpen(false)}>
        <Form initial={{ currency: 'NGN', status: 'paid', method: 'paystack' }} onDone={() => setOpen(false)} submit="Log payment"
          fields={[['student_id', 'Student', 'select', (students || []).map(s => [s.id, s.full_name])], ['amount', 'Amount', 'number'],
            ['currency', 'Currency', 'select', ['NGN', 'USD']], ['method', 'Method', 'select', [['paystack', 'Paystack'], ['paypal', 'PayPal'], ['transfer', 'Bank transfer']]],
            ['period_month', 'For month', 'month'], ['reference', 'Reference (optional)'], ['status', 'Status', 'select', ['paid', 'pending', 'failed']]]}
          onSave={async v => {
            const row = clean({ ...v, period_month: v.period_month ? `${v.period_month}-01` : null, paid_at: v.status === 'paid' ? new Date().toISOString() : null })
            const { error } = await sb.from('payments').insert(row)
            if (!error) { toast('Payment logged'); reload() }
            return error
          }} />
      </Sheet>
    </section>
  )
}

// ---------- Library ----------
const RES_COLS = ['title', 'level', 'skill', 'source', 'url']
export function AdminLibrary() {
  const [rows, err, reload] = useRows(() => sb.from('resources').select('*').order('level').order('title'))
  const [q, setQ] = useState('')
  const [f, setF] = useState({})
  const [sheet, setSheet] = useState(null) // 'new' | resource
  async function save(v) {
    const row = clean(Object.fromEntries(RES_COLS.map(k => [k, v[k] ?? null])))
    const { error } = sheet === 'new' ? await sb.from('resources').insert(row) : await sb.from('resources').update(row).eq('id', sheet.id)
    if (!error) { toast(sheet === 'new' ? 'Resource added' : 'Resource updated'); reload() }
    return error
  }
  const remove = async id => { await sb.from('resources').delete().eq('id', id); toast('Resource removed'); reload() }
  const shown = (rows || []).filter(r => has(q, r.title, r.source) && (!f.level || r.level === f.level) && (!f.skill || r.skill === f.skill))
  return (
    <section>
      <PageHeader title="Library" sub="Free resources tutors use in class. Tutors see this list, sorted by level and skill.">
        <AddButton onClick={() => setSheet('new')}>Add resource</AddButton>
      </PageHeader>
      <Toolbar search={q} onSearch={setQ} placeholder="Search title or source" values={f} onChange={setF}
        filters={[['level', 'Level', 'select', LEVELS], ['skill', 'Skill', 'select', SKILLS]]} />
      <div className="panel flush">
        <State rows={rows && shown} err={err} empty="No resources match." />
        {shown.length > 0 && <Table head={['Resource', 'Level', 'Skill', 'Source', '']} rows={shown.map(r => ({
          key: r.id, cells: [
            <a className="cell-title" href={r.url} target="_blank" rel="noreferrer"><b>{r.title}</b></a>,
            <Lvl l={r.level} />, r.skill, r.source || '–',
            <span className="actions"><button className="link alt" onClick={() => setSheet(r)}>Edit</button><ConfirmButton onConfirm={() => remove(r.id)}>Remove</ConfirmButton></span>,
          ] }))} />}
      </div>
      <Sheet open={!!sheet} title={sheet === 'new' ? 'Add resource' : `Edit ${sheet?.title}`} onClose={() => setSheet(null)}>
        <Form key={sheet?.id || 'new'} onDone={() => setSheet(null)} submit={sheet === 'new' ? 'Add resource' : 'Save changes'}
          initial={sheet && sheet !== 'new' ? Object.fromEntries(RES_COLS.map(k => [k, sheet[k] ?? ''])) : { skill: 'Listening' }}
          fields={[['title', 'Title'], ['level', 'Level', 'select', LEVELS], ['skill', 'Skill', 'select', SKILLS], ['source', 'Source', 'text', null, null, 'For example: TV5Monde, RFI Savoirs'], ['url', 'Link', 'url']]}
          onSave={save} />
      </Sheet>
    </section>
  )
}
