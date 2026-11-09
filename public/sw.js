// Shows push notifications and opens the right page when tapped
self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : {}
  e.waitUntil(self.registration.showNotification(d.title || 'Learn French Academy', {
    body: d.body || '', icon: '/logo.png', badge: '/logo.png', data: { url: d.url || '/' }
  }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(clients.openWindow(e.notification.data.url))
})
