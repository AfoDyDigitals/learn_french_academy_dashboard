import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { sb } from '../supabase'
import { useRows } from '../ui'
import { PageHeader } from '../components'

// Conversations are between one student/tutor (thread_user) and the academy team (admins).
const stamp = d => {
  const t = new Date(d), today = new Date().toDateString() === t.toDateString()
  return t.toLocaleString('en-GB', today ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Live unread count for the menu badge
export function useUnread(me, isAdmin) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!me) return
    const load = async () => {
      if (isAdmin) { const { data } = await sb.rpc('message_threads'); setN((data || []).reduce((a, t) => a + t.unread, 0)) }
      else { const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('thread_user', me).neq('sender', me).is('read_at', null); setN(count || 0) }
    }
    load()
    const ch = sb.channel(`unread-${me}`).on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load).subscribe()
    addEventListener('lfa-read', load)
    return () => { sb.removeChannel(ch); removeEventListener('lfa-read', load) }
  }, [me, isAdmin])
  return n
}

function Chat({ thread, me, title, onBack }) {
  const [msgs, setMsgs] = useState(null)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(null)
  const markRead = () => sb.rpc('mark_read', { p_thread: thread }).then(() => dispatchEvent(new Event('lfa-read')))

  useEffect(() => {
    setMsgs(null)
    sb.from('messages').select('*').eq('thread_user', thread).order('created_at').limit(500)
      .then(({ data, error }) => { setMsgs(data || []); if (error) setErr(error.message) })
    markRead()
    const ch = sb.channel(`thread-${thread}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_user=eq.${thread}` }, ({ new: m }) => {
        setMsgs(list => list && !list.some(x => x.id === m.id) ? [...list, m] : list)
        if (m.sender !== me) markRead()
      }).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [thread]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs])

  async function send(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setBusy(true); setErr('')
    const { data, error } = await sb.from('messages').insert({ thread_user: thread, sender: me, body }).select().single()
    setBusy(false)
    if (error) return setErr(`Not sent: ${error.message}`)
    setText(''); setMsgs(list => list.some(x => x.id === data.id) ? list : [...list, data])
  }

  return (
    <div className="panel chat">
      <div className="chat-head">{onBack && <button className="link alt" onClick={onBack}>← All</button>}<b>{title}</b></div>
      <div className="chat-body">
        {msgs === null ? <p className="meta">Loading…</p>
          : !msgs.length ? <p className="empty">No messages yet. Say hello 👋</p>
          : msgs.map(m => (
            <div key={m.id} className={`bubble ${m.sender === me ? 'mine' : ''}`}>
              <p>{m.body}</p><small>{stamp(m.created_at)}{m.sender === me && m.read_at ? ' · Seen' : ''}</small>
            </div>))}
        <div ref={end} />
      </div>
      {err && <p className="note bad">{err}</p>}
      <form className="composer" onSubmit={send}>
        <textarea rows={1} placeholder="Write a message…" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) send(e) }} />
        <button className="btn" disabled={busy || !text.trim()}>Send</button>
      </form>
    </div>
  )
}

// Students and tutors: one conversation with the academy team
export function Messages({ me }) {
  return (
    <section>
      <PageHeader title="Messages" sub="Chat with the Learn French Academy team. We usually reply within a few hours." />
      <Chat thread={me} me={me} title="Academy team" />
    </section>
  )
}

// Admins: inbox of every conversation, plus start a new one with any student or tutor
export function AdminMessages({ me }) {
  const [params, setParams] = useSearchParams()
  const open = params.get('u')
  const [threads, err, reload] = useRows(() => sb.rpc('message_threads'))
  const [people] = useRows(() => sb.from('profiles').select('id, full_name, role').in('role', ['student', 'tutor']).order('full_name'))
  const [q, setQ] = useState('')
  useEffect(() => {
    const ch = sb.channel('inbox').on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => reload()).subscribe()
    return () => { sb.removeChannel(ch) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const select = id => setParams(id ? { u: id } : {})
  const person = id => (people || []).find(p => p.id === id) || (threads || []).find(t => t.thread_user === id)
  const others = (people || []).filter(p => !(threads || []).some(t => t.thread_user === p.id) && (!q || (p.full_name || '').toLowerCase().includes(q.toLowerCase())))
  const shown = (threads || []).filter(t => !q || (t.full_name || '').toLowerCase().includes(q.toLowerCase()))
  const label = p => `${p?.full_name || 'Unnamed'}${p?.role ? ` · ${p.role === 'student' ? 'Student' : 'Tutor'}` : ''}`

  return (
    <section>
      <PageHeader title="Messages" sub="Students and tutors message the academy here. Students can't message tutors directly." />
      <div className={`inbox ${open ? 'has-open' : ''}`}>
        <div className="panel inbox-list">
          <input className="inbox-search" type="search" placeholder="Search or start a chat" value={q} onChange={e => setQ(e.target.value)} />
          {err && <p className="note bad">{err.message}</p>}
          {threads && !shown.length && !q && <p className="empty">No messages yet.</p>}
          {shown.map(t => (
            <button key={t.thread_user} className={`thread ${open === t.thread_user ? 'on' : ''}`} onClick={() => select(t.thread_user)}>
              <span className="grow"><b>{label(t)}</b><small>{t.last_body}</small></span>
              <span className="thread-side"><small>{stamp(t.last_at)}</small>{t.unread > 0 && <span className="badge">{t.unread}</span>}</span>
            </button>))}
          {q && others.length > 0 && <><div className="k">Start a new chat</div>
            {others.slice(0, 20).map(p => <button key={p.id} className="thread" onClick={() => { select(p.id); setQ('') }}><span className="grow"><b>{label(p)}</b></span></button>)}</>}
          {!q && <p className="meta inbox-tip">To message someone new, search their name.</p>}
        </div>
        {open ? <Chat key={open} thread={open} me={me} title={label(person(open))} onBack={() => select(null)} />
          : <div className="panel inbox-empty"><p className="meta">Pick a conversation.</p></div>}
      </div>
    </section>
  )
}
