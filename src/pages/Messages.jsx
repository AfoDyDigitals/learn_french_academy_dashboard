import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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

const MAX_MB = 15
const kb = n => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const Icon = ({ d }) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
const CLIP = <path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
const MIC = <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>

// Shows a photo, a voice note player, or a download link
function Attachment({ m, url }) {
  if (!url) return <p className="att-file meta">Loading attachment…</p>
  if (m.file_type?.startsWith('image/')) return <a href={url} target="_blank" rel="noreferrer"><img className="att-img" src={url} alt={m.file_name || 'Photo'} loading="lazy" /></a>
  if (m.file_type?.startsWith('audio/')) return <audio className="att-audio" controls preload="metadata" src={url} />
  return <a className="att-file" href={url} target="_blank" rel="noreferrer" download={m.file_name}>
    <Icon d={CLIP} /><span><b>{m.file_name}</b><small>{m.file_size ? kb(m.file_size) : ''} · Download</small></span></a>
}

// One-line summary of a message, for reply quotes
const gist = m => m.body?.trim() ? m.body.trim().slice(0, 140)
  : m.file_type?.startsWith('image/') ? '📷 Photo' : m.file_type?.startsWith('audio/') ? '🎤 Voice note' : `📎 ${m.file_name || 'File'}`

function Chat({ thread, me, title, onBack }) {
  const [msgs, setMsgs] = useState(null)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(null)
  const box = useRef(null)
  const input = useRef(null)
  const picker = useRef(null)
  const [urls, setUrls] = useState({})
  const [rec, setRec] = useState(null) // { recorder, started, secs } while recording
  const [secs, setSecs] = useState(0)
  const [pending, setPending] = useState(null) // file chosen, waiting for a caption: { file, preview }
  const [replyTo, setReplyTo] = useState(null) // message being replied to
  const [typing, setTyping] = useState(false) // the other side is typing
  const channel = useRef(null)
  const lastTyped = useRef(0)
  const typingTimer = useRef(null)
  // Who wrote a message, as shown in reply quotes
  const who = m => m.sender === me ? 'You' : m.sender === thread ? title : 'Academy team'
  // Phones: the chat fills the visible screen and follows the on-screen keyboard
  useEffect(() => {
    const vv = window.visualViewport, el = box.current
    const fit = () => {
      el.style.setProperty('--vv-top', `${vv ? vv.offsetTop : 0}px`)
      el.style.setProperty('--vv-h', `${vv ? vv.height : innerHeight}px`)
      end.current?.scrollIntoView({ block: 'end' })
    }
    fit()
    document.documentElement.classList.add('chat-open')
    vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit); addEventListener('resize', fit)
    return () => {
      document.documentElement.classList.remove('chat-open')
      vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit); removeEventListener('resize', fit)
    }
  }, [])
  const grow = el => { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 140)}px` }
  const markRead = () => sb.rpc('mark_read', { p_thread: thread }).then(() => dispatchEvent(new Event('lfa-read')))

  useEffect(() => {
    setMsgs(null)
    sb.from('messages').select('*').eq('thread_user', thread).order('created_at').limit(500)
      .then(({ data, error }) => { setMsgs(data || []); if (error) setErr(error.message) })
    markRead()
    const ch = sb.channel(`thread-${thread}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_user=eq.${thread}` }, ({ new: m }) => {
        setMsgs(list => list && !list.some(x => x.id === m.id) ? [...list, m] : list)
        if (m.sender !== me) { markRead(); setTyping(false) }
      })
      // "Typing…": short live signals, never stored
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.user === me) return
        setTyping(true); clearTimeout(typingTimer.current)
        typingTimer.current = setTimeout(() => setTyping(false), 3500)
      })
      .subscribe()
    channel.current = ch
    return () => { sb.removeChannel(ch); clearTimeout(typingTimer.current); setTyping(false) }
  }, [thread]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, typing])
  // Tell the other side we're typing, at most every 2 seconds
  const ping = () => {
    if (Date.now() - lastTyped.current < 2000) return
    lastTyped.current = Date.now()
    channel.current?.send({ type: 'broadcast', event: 'typing', payload: { user: me } })
  }
  const pick = file => {
    if (!file) return
    if (file.size > MAX_MB * 1048576) return setErr(`That file is ${kb(file.size)}. The limit is ${MAX_MB} MB.`)
    setErr(''); setPending({ file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })
    input.current?.focus()
  }
  const clearPending = () => { if (pending?.preview) URL.revokeObjectURL(pending.preview); setPending(null) }
  const reset = () => { setText(''); setReplyTo(null); if (input.current) input.current.style.height = '' }
  const jump = id => {
    const el = document.getElementById(`m-${id}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200)
  }
  // Private files: get short-lived links for any attachment we haven't loaded yet
  useEffect(() => {
    const need = (msgs || []).map(m => m.file_path).filter(p => p && !urls[p])
    if (!need.length) return
    sb.storage.from('attachments').createSignedUrls(need, 3600)
      .then(({ data }) => data && setUrls(u => ({ ...u, ...Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl])) })))
  }, [msgs]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!rec) return; const t = setInterval(() => setSecs(Math.round((Date.now() - rec.started) / 1000)), 500); return () => clearInterval(t) }, [rec])

  // Upload a file to this conversation's folder, then post it as a message (current text becomes the caption)
  async function sendFile(file) {
    if (!file) return
    if (file.size > MAX_MB * 1048576) return setErr(`That file is ${kb(file.size)}. The limit is ${MAX_MB} MB.`)
    setBusy(true); setErr('')
    const path = `${thread}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_').slice(-80)}`
    const up = await sb.storage.from('attachments').upload(path, file, { contentType: file.type || 'application/octet-stream' })
    if (up.error) { setBusy(false); return setErr(`Not sent: ${up.error.message}`) }
    const { data, error } = await sb.from('messages').insert({ thread_user: thread, sender: me, body: text.trim(), reply_to: replyTo?.id || null,
      file_path: path, file_name: file.name, file_type: file.type || 'application/octet-stream', file_size: file.size }).select().single()
    setBusy(false)
    if (error) { sb.storage.from('attachments').remove([path]); return setErr(`Not sent: ${error.message}`) }
    reset(); clearPending()
    setMsgs(list => list.some(x => x.id === data.id) ? list : [...list, data])
  }

  // Voice notes: tap the mic to record, then send or cancel
  async function startRec() {
    setErr('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return setErr('Voice notes are not supported in this browser.')
    let stream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { return setErr('Allow microphone access to record a voice note.') }
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t)) || ''
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    const chunks = []
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data)
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      if (recorder.cancelled || !chunks.length) return
      const mime = (recorder.mimeType || type || 'audio/webm').split(';')[0]
      sendFile(new File(chunks, `Voice note ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.${mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: mime }))
    }
    recorder.start()
    setSecs(0); setRec({ recorder, started: Date.now() })
  }
  const stopRec = cancel => { if (!rec) return; rec.recorder.cancelled = cancel; rec.recorder.stop(); setRec(null) }

  async function send(e) {
    e.preventDefault()
    if (busy) return
    if (pending) return sendFile(pending.file)
    const body = text.trim()
    if (!body) return
    setBusy(true); setErr('')
    const { data, error } = await sb.from('messages').insert({ thread_user: thread, sender: me, body, reply_to: replyTo?.id || null }).select().single()
    setBusy(false)
    if (error) return setErr(`Not sent: ${error.message}`)
    reset(); input.current?.focus(); setMsgs(list => list.some(x => x.id === data.id) ? list : [...list, data])
  }

  return (
    <div className="panel chat" ref={box}>
      <div className="chat-head">{onBack && <button className="chat-back" onClick={onBack} aria-label="Back">←</button>}
        <span className="chat-title"><b>{title}</b>{typing && <small className="typing-label">typing…</small>}</span></div>
      <div className="chat-body">
        {msgs === null ? <p className="meta">Loading…</p>
          : !msgs.length ? <p className="empty">No messages yet. Say hello 👋</p>
          : msgs.map(m => {
            const q = m.reply_to && msgs.find(x => x.id === m.reply_to)
            return (
              <div key={m.id} id={`m-${m.id}`} className={`msg ${m.sender === me ? 'mine' : ''}`}>
                <div className="bubble">
                  {m.reply_to && <button type="button" className="quote" onClick={() => q && jump(q.id)}>
                    <b>{q ? who(q) : 'Message'}</b><span>{q ? gist(q) : 'Original message not available'}</span></button>}
                  {m.file_path && <Attachment m={m} url={urls[m.file_path]} />}
                  {m.body && <p>{m.body}</p>}<small>{stamp(m.created_at)}{m.sender === me && m.read_at ? ' · Seen' : ''}</small>
                </div>
                <button type="button" className="reply-btn" aria-label="Reply to this message" title="Reply"
                  onClick={() => { setReplyTo(m); input.current?.focus() }}>↩</button>
              </div>
            )
          })}
        {typing && <div className="msg"><div className="bubble typing-dots" aria-label={`${title} is typing`}><i /><i /><i /></div></div>}
        <div ref={end} />
      </div>
      {err && <p className="note bad">{err}</p>}
      {replyTo && !rec && <div className="compose-bar">
        <div className="quote"><b>Replying to {who(replyTo) === 'You' ? 'yourself' : who(replyTo)}</b><span>{gist(replyTo)}</span></div>
        <button type="button" className="bar-x" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>×</button></div>}
      {pending && !rec && <div className="compose-bar">
        {pending.preview ? <img className="pending-img" src={pending.preview} alt="" /> : <span className="pending-icon"><Icon d={CLIP} /></span>}
        <div className="grow pending-name"><b>{pending.file.name}</b><small>{kb(pending.file.size)} · add a caption or tap Send</small></div>
        <button type="button" className="bar-x" aria-label="Remove attachment" onClick={clearPending}>×</button></div>}
      {rec ? (
        <div className="composer recording">
          <button type="button" className="link danger" onClick={() => stopRec(true)}>Cancel</button>
          <span className="rec-dot" aria-hidden="true" /><span className="grow">Recording {clock(secs)}</span>
          <button type="button" className="btn" onClick={() => stopRec(false)}>Send</button>
        </div>
      ) : (
        <form className="composer" onSubmit={send}>
          <input ref={picker} type="file" hidden accept="image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
            onChange={e => { pick(e.target.files[0]); e.target.value = '' }} />
          <button type="button" className="icon-btn" aria-label="Attach a photo or file" disabled={busy} onClick={() => picker.current.click()}><Icon d={CLIP} /></button>
          <textarea ref={input} rows={1} placeholder={busy ? 'Sending…' : pending ? 'Add a caption…' : 'Write a message…'} value={text} onChange={e => { setText(e.target.value); grow(e.target); ping() }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) send(e) }} />
          {text.trim() || pending
            ? <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
            : <button type="button" className="icon-btn mic" aria-label="Record a voice note" disabled={busy} onClick={startRec}><Icon d={MIC} /></button>}
        </form>
      )}
    </div>
  )
}

// Students and tutors: one conversation with the academy team
export function Messages({ me }) {
  const nav = useNavigate()
  return (
    <section>
      <PageHeader title="Messages" sub="Chat with the Learn French Academy team. We usually reply within a few hours." />
      <Chat thread={me} me={me} title="Academy team" onBack={() => nav('/')} />
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
