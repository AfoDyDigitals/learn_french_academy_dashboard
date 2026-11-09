import { useState } from 'react'
import { sb } from '../supabase'
import { useRows, Lvl, State } from '../ui'

const LEVELS = ['All', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'TCF']
const SKILLS = ['All', 'Listening', 'Speaking', 'Reading', 'Writing', 'Grammar']

export default function Library() {
  const [lvl, setLvl] = useState('All')
  const [sk, setSk] = useState('All')
  const [q, setQ] = useState('')
  const [rows, err] = useRows(() => sb.from('resources').select('*').order('level').order('title'))

  const shown = rows?.filter(r => (lvl === 'All' || r.level === lvl) && (sk === 'All' || r.skill === sk) && r.title.toLowerCase().includes(q.toLowerCase()))
  const chips = (vals, cur, set) => <div className="filters">{vals.map(v => <button key={v} className="chip" aria-pressed={cur === v} onClick={() => set(v)}>{v}</button>)}</div>

  return (
    <section>
      <div className="top"><div><h1>Resource library</h1><p className="sub">Free listening and speaking material, sorted by level and skill.</p></div></div>
      {chips(LEVELS, lvl, setLvl)}
      {chips(SKILLS, sk, setSk)}
      <div className="filters"><input className="search" type="search" placeholder="Search topics, e.g. au restaurant" value={q} onChange={e => setQ(e.target.value)} /></div>
      <State rows={shown} err={err} empty="No material for this filter yet. Try another level or skill." />
      <div className="cards">
        {shown?.map(r => (
          <a className="res" key={r.id} href={r.url} target="_blank" rel="noreferrer">
            <div className="thumb"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></div>
            <div className="tags"><Lvl l={r.level} /><span className="tag">{r.skill}</span></div>
            <h3>{r.title}</h3>
            <div className="src">{r.source} ↗</div>
          </a>
        ))}
      </div>
    </section>
  )
}
