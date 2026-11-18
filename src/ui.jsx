import { useEffect, useState } from 'react'

// Load rows from a Supabase query once; returns [rows, error, reload]
export function useRows(query, deps = []) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const load = () => query().then(({ data, error }) => { setRows(data || []); setErr(error) })
  useEffect(() => { load() }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return [rows, err, load]
}

// Stored level 'TCF' covers both TEF and TCF exam prep
export const lvlLabel = l => (l === 'TCF' ? 'TEF/TCF' : l)
export const Lvl = ({ l }) => <span className={`lvl ${l}`}>{lvlLabel(l)}</span>
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', ['TCF', 'TEF/TCF']]
// Bonjour until 6 pm, Bonsoir after, by the viewer's clock
export const greeting = name => `${new Date().getHours() < 18 ? 'Bonjour' : 'Bonsoir'}, ${name.split(' ')[0]}`
// Free exam practice, shown at the top of the library
export const EXAM_PRACTICE = [
  ['TCF practice tests', 'TV5Monde · free exercises by section', 'https://apprendre.tv5monde.com/fr/tcf'],
  ['TEF Canada preparation', 'CCI Paris (official) · how to prepare', 'https://www.lefrancaisdesaffaires.fr/en/candidate/test-evaluation-francais/tef-canada/preparation/'],
]

export const fmtTime = d => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })
export const fmtDay = d => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })

export function State({ rows, err, empty }) {
  if (err) return <p className="empty">Couldn't load this: {err.message}</p>
  if (!rows) return <p className="empty">Loading…</p>
  if (!rows.length) return <p className="empty">{empty}</p>
  return null
}

// ---------- Level progress ----------
export const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
// Week of the current level (1-based) counted from when the student started it.
// weeks = level length incl. the assessment week (null = length not set yet)
export function progressOf(level, startedOn, lengths) {
  if (!startedOn || !LEVEL_ORDER.includes(level)) return null
  const weeks = (lengths || []).find(l => l.level === level)?.weeks ?? null
  const days = Math.floor((new Date(new Date().toDateString()) - new Date(String(startedOn).slice(0, 10))) / 864e5)
  const raw = Math.max(1, Math.floor(days / 7) + 1)
  const week = weeks ? Math.min(raw, weeks) : raw
  return { week, weeks, pct: weeks ? Math.round(100 * week / weeks) : null, assessment: !!weeks && week === weeks, late: !!weeks && raw > weeks }
}
export const progressLabel = p => !p ? '' : p.weeks ? `Week ${p.week} of ${p.weeks}` : `Week ${p.week}`
