import { useEffect, useState } from 'react'
import { sb } from '../supabase'
import { useRows, fmtDay, State } from '../ui'
import { PageHeader, toast } from '../components'

export default function Report() {
  const since = new Date(); since.setDate(since.getDate() - 14)
  const [classes, err] = useRows(() => sb.from('classes').select('id, title, level, starts_at, duration_min, class_students(student_id, attended, students(full_name))').gte('starts_at', since.toISOString()).lte('starts_at', new Date().toISOString()).order('starts_at', { ascending: false }))
  const [classId, setClassId] = useState('')
  const [att, setAtt] = useState({})
  const [form, setForm] = useState({ covered: '', homework: '', notes: '', duration_min: '' })
  const [msg, setMsg] = useState('')

  const cls = classes?.find(c => c.id === classId)
  useEffect(() => { if (classes?.length && !classId) setClassId(classes[0].id) }, [classes, classId])
  useEffect(() => {
    setAtt(Object.fromEntries((cls?.class_students || []).map(s => [s.student_id, s.attended ?? true])))
    setForm(f => ({ ...f, duration_min: cls?.duration_min ?? '' }))
  }, [cls])

  async function submit(e) {
    e.preventDefault(); setMsg('')
    const { data: { user } } = await sb.auth.getUser()
    const { error } = await sb.from('reports').insert({ class_id: classId, tutor_id: user.id, ...form, duration_min: Number(form.duration_min) || null })
    if (error) return setMsg(`Not saved: ${error.message}`)
    await Promise.all(Object.entries(att).map(([sid, a]) => sb.from('class_students').update({ attended: a }).eq('class_id', classId).eq('student_id', sid)))
    setForm({ covered: '', homework: '', notes: '', duration_min: cls?.duration_min ?? '' }); toast('Report submitted')
  }

  const set = k => e => setForm({ ...form, [k]: e.target.value })

  return (
    <section>
      <PageHeader title="Class report" sub="Takes about 2 minutes. Admins see it right away." />
      <State rows={classes} err={err} empty="No classes in the last 14 days to report on." />
      {classes?.length > 0 && (
        <form className="panel form narrow" onSubmit={submit}>
          <div className="field"><label htmlFor="rc">Class</label>
            <select id="rc" value={classId} onChange={e => setClassId(e.target.value)}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.level} · {fmtDay(c.starts_at)} · {c.title}</option>)}
            </select></div>
          {cls?.class_students.length > 0 && (
            <fieldset className="field"><legend>Who attended?</legend>
              {cls.class_students.map(s => (
                <label key={s.student_id} className="check"><input type="checkbox" checked={!!att[s.student_id]} onChange={e => setAtt({ ...att, [s.student_id]: e.target.checked })} /> {s.students?.full_name}</label>
              ))}
            </fieldset>
          )}
          <div className="field"><label htmlFor="rd">How long did the class take? (minutes)</label><input id="rd" type="number" min="1" required value={form.duration_min} onChange={set('duration_min')} /></div>
          <div className="field"><label htmlFor="rt">What did you cover?</label><textarea id="rt" rows="3" required value={form.covered} onChange={set('covered')} /></div>
          <div className="field"><label htmlFor="rh">Homework set</label><input id="rh" value={form.homework} onChange={set('homework')} /></div>
          <div className="field"><label htmlFor="rn">Anything admins should know?</label><input id="rn" placeholder="Optional" value={form.notes} onChange={set('notes')} /></div>
          {msg && <p className="note bad">{msg}</p>}
          <div className="form-actions"><button className="btn">Submit report</button></div>
        </form>
      )}
    </section>
  )
}
