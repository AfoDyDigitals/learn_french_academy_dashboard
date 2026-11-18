// Delivers queued notifications. Triggered every minute by pg_cron when the queue has items.
// Web push for everything; for new messages, also a short "you have a new message" email.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC = 'BIvwk0YxEAjQ0fiMoi_hnzD2oIdEuaJ5UWLgmXoSFYm7W13AbtVPUhMLYSEZ4X7FWMybfh91gf_KnE3pQjX0xrQ'
const SITE = 'https://dashboard.learnfrenchacademy.com'
const STALE_MIN = 60   // older alerts are dropped, not sent late
const EMAIL_GAP_MIN = 10 // at most one message email per person per 10 minutes
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

async function sendEmail(to: string, title: string, preview: string, url: string) {
  const isMsg = url.startsWith('/messages')
  const heading = isMsg ? 'You have a new message' : title
  const button = isMsg ? 'Open messages' : url.startsWith('/payments') ? 'View payments' : 'Open dashboard'
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return 'no RESEND_API_KEY'
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') || 'Learn French Academy <onboarding@resend.dev>',
      to, subject: heading,
      text: `${heading}\n\n${isMsg ? `${title}\n\n"${preview}"` : preview}\n\n${button}: ${SITE}${url}\n\nLearn French Academy`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1d1a5e">
        <img src="${SITE}/logo.png" alt="Learn French Academy" height="48">
        <h2 style="margin:16px 0 8px">${esc(heading)}</h2>
        ${isMsg ? `<p style="margin:0 0 4px;color:#5d6185">${esc(title)}</p>` : ''}
        <blockquote style="margin:12px 0;padding:10px 14px;background:#f3f6fc;border-left:3px solid #2563ff">${esc(preview)}</blockquote>
        <a href="${SITE}${url}" style="display:inline-block;background:#2563ff;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${button}</a>
        <p style="font-size:12px;color:#5d6185;margin-top:24px">Learn French Academy · Questions? Message us in the dashboard.</p></div>`,
    }),
  })
  return r.ok ? null : `resend ${r.status} ${await r.text()}`
}

Deno.serve(async () => {
  const { data: queue } = await db.from('notify_queue').select('*').is('sent_at', null).order('id').limit(100)
  if (!queue?.length) return Response.json({ sent: 0 })

  // Mark first so overlapping runs don't send twice
  const now = Date.now()
  await db.from('notify_queue').update({ sent_at: new Date(now).toISOString() }).in('id', queue.map(q => q.id))
  const fresh = queue.filter(q => now - new Date(q.created_at).getTime() < STALE_MIN * 6e4)

  // Web push
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  let pushed = 0
  if (priv && fresh.length) {
    webpush.setVapidDetails('mailto:learnfrenchacademy1@gmail.com', VAPID_PUBLIC, priv)
    const { data: subs } = await db.from('push_subscriptions').select('*').in('user_id', [...new Set(fresh.map(q => q.user_id))])
    for (const q of fresh) for (const s of (subs || []).filter(s => s.user_id === q.user_id)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: q.title, body: q.body, url: q.url }))
        pushed++
      } catch (e) {
        // Device unsubscribed or expired: forget it
        if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
      }
    }
  }

  // Emails (new messages, payment reminders): newest per person, skipped if they were emailed in the last few minutes
  const errors: string[] = []
  let emailed = 0
  const latest = new Map<string, typeof fresh[0]>()
  for (const q of fresh.filter(q => q.email)) latest.set(q.user_id, q)
  for (const [user, q] of latest) {
    const { count } = await db.from('notify_queue').select('id', { count: 'exact', head: true })
      .eq('user_id', user).eq('email', true).not('id', 'in', `(${queue.map(x => x.id).join(',')})`)
      .gt('sent_at', new Date(now - EMAIL_GAP_MIN * 6e4).toISOString())
    if (count) continue
    const { data } = await db.auth.admin.getUserById(user)
    if (!data?.user?.email) continue
    const err = await sendEmail(data.user.email, q.title, q.body || '', q.url || '/messages')
    if (err) errors.push(err); else emailed++
  }

  return Response.json({ queued: queue.length, dropped_stale: queue.length - fresh.length, pushed, emailed, errors,
    push_ready: !!priv, email_ready: !!Deno.env.get('RESEND_API_KEY') })
})
