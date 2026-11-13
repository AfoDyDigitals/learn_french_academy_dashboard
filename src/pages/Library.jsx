import { useState } from 'react'
import { sb } from '../supabase'
import { useRows, Lvl, State, LEVELS, EXAM_PRACTICE } from '../ui'
import { PageHeader, Toolbar, ExamPractice } from '../components'

const SKILLS = ['Listening', 'Speaking', 'Reading', 'Writing', 'Grammar']

export default function Library() {
  const [q, setQ] = useState('')
  const [f, setF] = useState({})
  const [rows, err] = useRows(() => sb.from('resources').select('*').order('level').order('title'))
  const shown = rows?.filter(r => (!f.level || r.level === f.level) && (!f.skill || r.skill === f.skill)
    && [r.title, r.source].some(v => (v || '').toLowerCase().includes(q.toLowerCase())))

  return (
    <section>
      <PageHeader title="Library" sub="Free listening and speaking material, sorted by level and skill." />
      <ExamPractice links={EXAM_PRACTICE} />
      <Toolbar search={q} onSearch={setQ} placeholder="Search topics, e.g. au restaurant" values={f} onChange={setF}
        filters={[['level', 'Level', 'select', LEVELS], ['skill', 'Skill', 'select', SKILLS]]} />
      <State rows={shown} err={err} empty="Nothing matches. Try another search or clear the filters." />
      <div className="cards">
        {shown?.map(r => (
          <a className="res" key={r.id} href={r.url} target="_blank" rel="noreferrer">
            <div className="tags"><Lvl l={r.level} /><span className="tag">{r.skill}</span></div>
            <h3>{r.title}</h3>
            <div className="src">{r.source || 'Open'} ↗</div>
          </a>
        ))}
      </div>
    </section>
  )
}
