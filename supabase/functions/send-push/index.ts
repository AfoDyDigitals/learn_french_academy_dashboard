// Delivers queued notifications as web push. Triggered every minute by pg_cron when the queue has items.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC = 'BIvwk0YxEAjQ0fiMoi_hnzD2oIdEuaJ5UWLgmXoSFYm7W13AbtVPUhMLYSEZ4X7FWMybfh91gf_KnE3pQjX0xrQ'
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

Deno.serve(async () => {
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!priv) return Response.json({ error: 'VAPID_PRIVATE_KEY secret is not set' }, { status: 500 })
  webpush.setVapidDetails('mailto:learnfrenchacademy1@gmail.com', VAPID_PUBLIC, priv)

  const { data: queue } = await db.from('notify_queue').select('*').is('sent_at', null).order('id').limit(100)
  if (!queue?.length) return Response.json({ sent: 0 })

  // Mark first so overlapping runs don't send twice
  await db.from('notify_queue').update({ sent_at: new Date().toISOString() }).in('id', queue.map(q => q.id))

  const { data: subs } = await db.from('push_subscriptions').select('*').in('user_id', [...new Set(queue.map(q => q.user_id))])
  let sent = 0
  for (const q of queue) {
    for (const s of (subs || []).filter(s => s.user_id === q.user_id)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: q.title, body: q.body, url: q.url }))
        sent++
      } catch (e) {
        // Device unsubscribed or expired: forget it
        if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
      }
    }
  }
  return Response.json({ queued: queue.length, sent })
})
