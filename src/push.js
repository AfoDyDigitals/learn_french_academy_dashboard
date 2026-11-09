import { sb } from './supabase'

const VAPID_PUBLIC = 'BIvwk0YxEAjQ0fiMoi_hnzD2oIdEuaJ5UWLgmXoSFYm7W13AbtVPUhMLYSEZ4X7FWMybfh91gf_KnE3pQjX0xrQ'
const toKey = s => Uint8Array.from(atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

// Asks permission, subscribes this device and saves it. Returns a message for the user.
export async function enablePush() {
  if (!pushSupported()) return "This browser can't receive notifications. On iPhone, add the dashboard to your Home Screen first."
  if (await Notification.requestPermission() !== 'granted') return 'Notifications are blocked. Allow them in your browser settings.'
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC) })
  const { endpoint, keys } = sub.toJSON()
  const { error } = await sb.from('push_subscriptions').upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' })
  return error ? `Couldn't save: ${error.message}` : 'Notifications are on for this device.'
}

export async function pushEnabled() {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  return !!(await reg?.pushManager.getSubscription())
}
