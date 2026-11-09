import { useEffect, useState } from 'react'

// Load rows from a Supabase query once; returns [rows, error, reload]
export function useRows(query, deps = []) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  const load = () => query().then(({ data, error }) => { setRows(data || []); setErr(error) })
  useEffect(() => { load() }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return [rows, err, load]
}

export const Lvl = ({ l }) => <span className={`lvl ${l}`}>{l}</span>

export const fmtTime = d => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })
export const fmtDay = d => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })

export function State({ rows, err, empty }) {
  if (err) return <p className="empty">Couldn't load this: {err.message}</p>
  if (!rows) return <p className="empty">Loading…</p>
  if (!rows.length) return <p className="empty">{empty}</p>
  return null
}
