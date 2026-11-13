import { useEffect, useState } from 'react'

const Icon = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
export const icons = {
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  filter: <path d="M4 5h16l-6 8v5l-4 2v-7z" />,
  check: <path d="M5 12l5 5L20 7" />,
}

// Toasts: call toast('Saved') from anywhere; <Toaster /> shows them
export const toast = msg => window.dispatchEvent(new CustomEvent('lfa-toast', { detail: msg }))
export function Toaster() {
  const [items, setItems] = useState([])
  useEffect(() => {
    const on = e => {
      const id = Math.random()
      setItems(x => [...x, { id, msg: e.detail }])
      setTimeout(() => setItems(x => x.filter(i => i.id !== id)), 3200)
    }
    window.addEventListener('lfa-toast', on); return () => window.removeEventListener('lfa-toast', on)
  }, [])
  return <div className="toasts" role="status" aria-live="polite">{items.map(i => <div key={i.id} className="toast"><Icon d={icons.check} size={18} />{i.msg}</div>)}</div>
}

export function PageHeader({ title, sub, children }) {
  return (
    <header className="page-head">
      <div className="page-title"><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  )
}

export const AddButton = ({ children, onClick, ghost }) => (
  <button className={`btn ${ghost ? 'ghost' : ''}`} onClick={onClick}><Icon d={icons.plus} size={18} />{children}</button>
)

// Segmented tabs inside a page
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([v, label]) => <button key={v} role="tab" aria-selected={value === v} className="tab" onClick={() => onChange(v)}>{label}</button>)}
    </div>
  )
}

// Side panel on desktop, full-screen sheet on phones
export function Sheet({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return
    const esc = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    document.body.classList.add('locked')
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('locked') }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-head"><h2>{title}</h2><button className="icon-btn" aria-label="Close" onClick={onClose}><Icon d={icons.close} /></button></div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

const optLabel = (opts, v) => { const o = (opts || []).find(o => (Array.isArray(o) ? o[0] : o) === v); return Array.isArray(o) ? o[1] : (o ?? v) }

// Search + collapsible filters + removable chips for active filters. Results update instantly.
// filters = [[key, label, 'select'|'date'|'month', options]]; defaults are values that don't count as filtering
export function Toolbar({ search, onSearch, placeholder = 'Search', filters = [], values = {}, onChange, defaults = {} }) {
  const [open, setOpen] = useState(false)
  const active = filters.filter(([k]) => values[k] && values[k] !== defaults[k])
  const set = (k, v) => onChange({ ...values, [k]: v })
  return (
    <div className="toolbar">
      <div className="toolbar-row">
        {onSearch && (
          <label className="search">
            <Icon d={icons.search} size={18} />
            <input type="search" placeholder={placeholder} value={search} onChange={e => onSearch(e.target.value)} aria-label={placeholder} />
          </label>
        )}
        {filters.length > 0 && (
          <button className={`btn ghost filter-btn ${open ? 'on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon d={icons.filter} size={18} />Filters{active.length > 0 && <span className="count">{active.length}</span>}
          </button>
        )}
      </div>
      {open && (
        <div className="filter-panel">
          {filters.map(([k, label, type, opts]) => (
            <div className="field" key={k}>
              <label htmlFor={`flt-${k}`}>{label}</label>
              {type === 'select'
                ? <select id={`flt-${k}`} value={values[k] ?? ''} onChange={e => set(k, e.target.value)}>
                    {defaults[k] === undefined && <option value="">All</option>}
                    {opts.map(o => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o}>{o}</option>)}
                  </select>
                : <input id={`flt-${k}`} type={type} value={values[k] ?? ''} onChange={e => set(k, e.target.value)} />}
            </div>
          ))}
        </div>
      )}
      {active.length > 0 && (
        <div className="chips">
          {active.map(([k, label, , opts]) => (
            <button key={k} className="chip on" onClick={() => set(k, defaults[k] ?? '')} aria-label={`Remove filter ${label}`}>
              {label}: {optLabel(opts, values[k])}<Icon d={icons.close} size={14} />
            </button>
          ))}
          <button className="link alt" onClick={() => onChange({ ...defaults })}>Clear all</button>
        </div>
      )}
    </div>
  )
}

// Table on desktop, stacked cards on phones. rows = [{ key, cells: [...] }]; first cell is the card title
export function Table({ head, rows }) {
  return (
    <div className="table-wrap">
      <table className="rt">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r.key}>{r.cells.map((c, i) => <td key={i} data-label={head[i]}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

// Two-step button for destructive actions: first tap asks, second tap does it
export function ConfirmButton({ children, ask = 'Tap again to confirm', onConfirm, className = 'link danger' }) {
  const [asking, setAsking] = useState(false)
  useEffect(() => { if (!asking) return; const t = setTimeout(() => setAsking(false), 3500); return () => clearTimeout(t) }, [asking])
  return <button className={`${className} ${asking ? 'asking' : ''}`} onClick={() => asking ? (setAsking(false), onConfirm()) : setAsking(true)}>{asking ? ask : children}</button>
}

// Pinned TEF/TCF practice links at the top of the library
export function ExamPractice({ links }) {
  return (
    <div className="exam">
      <div className="exam-head"><span className="lvl TCF">TEF/TCF</span><b>Exam practice</b></div>
      <div className="exam-links">{links.map(([t, d, u]) => (
        <a key={u} className="exam-link" href={u} target="_blank" rel="noreferrer"><b>{t} ↗</b><span>{d}</span></a>))}</div>
    </div>
  )
}

export function Empty({ title, children }) {
  return <div className="empty-state"><b>{title}</b>{children && <p>{children}</p>}</div>
}
