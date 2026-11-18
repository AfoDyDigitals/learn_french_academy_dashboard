import { useState } from 'react'
import { Link } from 'react-router-dom'
import { sb } from '../supabase'
import { useRows, Lvl, lvlLabel, fmtDay, fmtTime, State, greeting, LEVEL_ORDER, progressOf, progressLabel } from '../ui'
import { PageHeader, Tabs } from '../components'
import Library from './Library'

// The signed-in student's own record (RLS returns only theirs)
export const useMe = () => useRows(() => sb.from('students')
  .select('id, full_name, level, level_started_on, goal, exam_date, payment_due_date, tutor:profiles!students_tutor_id_fkey(full_name), class_students(attended)').maybeSingle())
const useMyClasses = () => useRows(() => sb.from('classes')
  .select('id, title, topic, level, week_no, starts_at, duration_min, meet_url, tutor:profiles(full_name), class_students(attended)').order('starts_at'))

const daysUntil = d => Math.round((new Date(String(d).slice(0, 10)) - new Date(new Date().toDateString())) / 864e5)
const when = d => { const n = daysUntil(d); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 1 ? `in ${n} days` : n === -1 ? 'yesterday' : `${-n} days ago` }
const ended = c => new Date(c.starts_at).getTime() + c.duration_min * 6e4 < Date.now()
const topic = c => c.topic || c.title

// Official DELF/DALF sample papers by level (France Éducation international)
const FEI = 'https://www.france-education-international.fr/diplome'
const examLinks = level => {
  const delf = { A1: 'a1', A2: 'a2', B1: 'b1', B2: 'b2' }[level]
  return [
    delf ? [`DELF ${level} sample papers`, 'France Éducation international (official)', `${FEI}/delf-tout-public/niveau-${delf}/exemples-sujets`]
      : ['DALF C1 sample papers', 'France Éducation international (official)', `${FEI}/dalf/exemples-sujets`],
    ['TCF practice tests', 'TV5Monde · free exercises by section', 'https://apprendre.tv5monde.com/fr/tcf'],
    ['TEF Canada preparation', 'CCI Paris (official) · how to prepare', 'https://www.lefrancaisdesaffaires.fr/en/candidate/test-evaluation-francais/tef-canada/preparation/'],
  ]
}

// Progress through the current level plus the A1 → C2 journey
function Progress({ me }) {
  const [lengths] = useRows(() => sb.from('level_lengths').select('*'))
  const [results] = useRows(() => sb.from('level_results').select('level, passed, score, exam_date').order('exam_date'))
  if (!LEVEL_ORDER.includes(me.level)) return null
  const p = progressOf(me.level, me.level_started_on, lengths)
  const passed = new Set((results || []).filter(r => r.passed).map(r => r.level))
  const cur = LEVEL_ORDER.indexOf(me.level)
  return (
    <div className="panel progress-card">
      <div className="panel-head"><h2>Your progress</h2>{p && <span className="meta">{progressLabel(p)}</span>}</div>
      {p?.weeks ? <div className="bar big" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${lvlLabel(me.level)} progress`}><i style={{ width: `${p.pct}%` }} /></div> : null}
      <p className="meta">{!p ? 'Your progress will appear once your level start date is set.'
        : !p.weeks ? `You're in week ${p.week} of ${lvlLabel(me.level)}. The course length will be shown here soon.`
        : p.late ? 'Your end-of-level exam is due. Your tutor will confirm the date with you.'
        : p.assessment ? 'Assessment week: this is your end-of-level exam. Bonne chance!'
        : `Week ${p.weeks} is your end-of-level exam. Pass it to unlock ${LEVEL_ORDER[cur + 1] || 'your certificate'}.`}</p>
      <ol className="journey">{LEVEL_ORDER.map((l, i) => {
        const done = i < cur || passed.has(l)
        return <li key={l} className={done ? 'done' : i === cur ? 'now' : 'locked'} aria-label={`${l}: ${done ? 'completed' : i === cur ? 'current level' : 'locked'}`}>
          <span>{done ? '✓' : i === cur ? l : '🔒'}</span><small>{l}</small></li>
      })}</ol>
    </div>
  )
}

const NotLinked = () => <div className="panel"><p>Your login isn't linked to a student record yet. Please contact the academy.</p></div>

export function StudentHome({ name }) {
  const [me, meErr] = useMe()
  const [classes, err] = useMyClasses()
  if (me === null && !meErr) return null
  if (!me) return <section><PageHeader title={greeting(name)} /><NotLinked /></section>
  const upcoming = (classes || []).filter(c => !ended(c))
  const next = upcoming[0]
  const marked = me.class_students.filter(c => c.attended !== null)
  const att = marked.length ? Math.round(100 * marked.filter(c => c.attended).length / marked.length) : null
  const due = me.payment_due_date ? daysUntil(me.payment_due_date) : null

  return (
    <section>
      <PageHeader title={greeting(name)} sub={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} />
      <div className="panel next-class">
        <div className="k">Next class</div>
        <State rows={classes} err={err} empty="No upcoming classes yet. Your schedule will appear here." />
        {next && <>
          <h2>{topic(next)}</h2>
          <p className="meta">{fmtDay(next.starts_at)} · {fmtTime(next.starts_at)} ({when(next.starts_at)}) · {next.duration_min} min{next.tutor && ` · with ${next.tutor.full_name}`}</p>
          {next.meet_url && <a className="btn" href={next.meet_url} target="_blank" rel="noreferrer">Join class</a>}
        </>}
      </div>
      <Progress me={me} />
      <div className="stats three">
        <div className="panel stat"><div className="k">Your level</div><div className="v"><Lvl l={me.level} /></div>
          <div className="n">{me.goal === 'tcf' ? `TEF/TCF prep${me.exam_date ? ` · exam ${fmtDay(me.exam_date)}` : ''}` : 'General French'}</div></div>
        <div className="panel stat"><div className="k">Attendance</div><div className="v">{att === null ? '–' : `${att}%`}</div><div className="n">{marked.length} classes marked</div></div>
        <div className={`panel stat ${due !== null && due <= 2 ? 'alert' : ''}`}><div className="k">Next payment</div>
          <div className="v sm">{me.payment_due_date ? fmtDay(me.payment_due_date) : '–'}</div>
          <div className="n">{me.payment_due_date ? (due < 0 ? 'Overdue' : `Due ${when(me.payment_due_date)}`) : 'Not set yet'} · <Link to="/payments" className="link alt">History</Link></div></div>
      </div>
      <div className="panel">
          <div className="panel-head"><h2>Your tutor</h2></div>
          <div className="row"><div className="av tutor-av">{(me.tutor?.full_name || '?').slice(0, 2).toUpperCase()}</div>
            <div className="grow"><b>{me.tutor?.full_name || 'Not assigned yet'}</b><div className="meta">Questions? <Link to="/messages" className="link alt">Message the academy team</Link>.</div></div></div>
          <div className="panel-head practice-cta"><h2>Practice</h2><Link to="/practice" className="link alt">Open</Link></div>
          <p className="meta">Listening, speaking and exam practice for {lvlLabel(me.level)}.</p>
      </div>
    </section>
  )
}

export function StudentClasses() {
  const [classes, err] = useMyClasses()
  const [notes] = useRows(() => sb.rpc('my_class_notes'))
  const [tab, setTab] = useState('upcoming')
  const upcoming = (classes || []).filter(c => !ended(c)).slice(0, 1) // only the next class
  const past = (classes || []).filter(ended).reverse()
  const note = id => (notes || []).find(n => n.class_id === id)
  const shown = tab === 'upcoming' ? upcoming : past
  return (
    <section>
      <PageHeader title="My classes" sub="Your next class. Times are Lagos time; join from here when it's time." />
      <Tabs value={tab} onChange={setTab} tabs={[['upcoming', 'Next up'], ['past', `Past${classes ? ` (${past.length})` : ''}`]]} />
      <div className="panel">
        <State rows={classes && shown} err={err} empty={tab === 'upcoming' ? 'No upcoming classes yet.' : 'No past classes yet.'} />
        <div className="list">{shown.map(c => {
          const n = note(c.id), a = c.class_students[0]?.attended
          return (
            <article className="row report" key={c.id}>
              <Lvl l={c.level} />
              <div className="grow">
                <div className="report-head"><b>{topic(c)}</b><span className="meta">{fmtDay(c.starts_at)} · {fmtTime(c.starts_at)} · {c.duration_min} min{c.week_no ? ` · Week ${c.week_no}` : ''}</span></div>
                {c.tutor && <p className="meta">With {c.tutor.full_name}</p>}
                {n?.covered && <p>{n.covered}</p>}
                {n?.homework && <p className="note">Homework: {n.homework}</p>}
              </div>
              {tab === 'upcoming'
                ? c.meet_url && <a className="pill info" href={c.meet_url} target="_blank" rel="noreferrer">Join</a>
                : a !== null && a !== undefined && <span className={`pill ${a ? 'ok' : 'bad'}`}>{a ? 'Attended' : 'Missed'}</span>}
            </article>
          )
        })}</div>
      </div>
    </section>
  )
}

const money = (n, c) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n)

// Next payment and every payment on record
export function StudentPayments() {
  const [me] = useMe()
  const [rows, err] = useRows(() => sb.from('payments').select('id, amount, currency, method, status, period_month, paid_at, created_at').order('created_at', { ascending: false }))
  if (me === null) return null
  if (!me) return <section><PageHeader title="Payments" /><NotLinked /></section>
  const due = me.payment_due_date ? daysUntil(me.payment_due_date) : null
  return (
    <section>
      <PageHeader title="Payments" sub="Your next payment and your payment history." />
      <div className={`panel next-pay ${due !== null && due <= 2 ? 'alert' : ''}`}>
        <div className="k">Next payment</div>
        {me.payment_due_date ? <>
          <h2>{fmtDay(me.payment_due_date)}</h2>
          <p className="meta">{due < 0 ? `Overdue by ${-due} day${due === -1 ? '' : 's'}. Please pay to keep your classes going.` : due === 0 ? 'Due today.' : `Due ${when(me.payment_due_date)}.`} We'll remind you 2 days and 1 day before.</p>
        </> : <p className="meta">Your next payment date hasn't been set yet.</p>}
        <Link to="/messages" className="link alt">Questions about payment? Message us</Link>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>History</h2></div>
        <State rows={rows} err={err} empty="No payments recorded yet." />
        <div className="list">{(rows || []).map(p => (
          <div className="row" key={p.id}>
            <div className="grow"><b className="num">{money(p.amount, p.currency)}</b>
              <div className="meta">{[p.period_month && `For ${new Date(p.period_month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`,
                fmtDay(p.paid_at || p.created_at), { paystack: 'Paystack', paypal: 'PayPal', transfer: 'Bank transfer' }[p.method]].filter(Boolean).join(' · ')}</div></div>
            <span className={`pill ${p.status === 'paid' ? 'ok' : p.status === 'pending' ? 'warn' : 'bad'}`}>{p.status === 'paid' ? 'Paid' : p.status === 'pending' ? 'Pending' : 'Failed'}</span>
          </div>))}</div>
      </div>
    </section>
  )
}

export function StudentPractice() {
  const [me] = useMe()
  if (!me) return me === null ? null : <section><PageHeader title="Practice" /><NotLinked /></section>
  return <Library level={me.level} exam={examLinks(me.level)} sub={`Free listening, speaking and exam practice. Showing ${lvlLabel(me.level)} first; clear the filter to see every level.`} />
}
