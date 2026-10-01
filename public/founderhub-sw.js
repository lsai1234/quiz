/*
 * The Founders Hub's service worker: order notifications and the review badge.
 *
 * Registered by `HubApp` with scope /founderhub, so it never touches the
 * customer site. It does nothing else — no fetch handler, no caching — because
 * a hub that shows a stale order list from a cache is worse than one that
 * needs the network, and the network is what the hub is for.
 *
 * The message shape is `PushMessage` in `src/lib/push/send.ts`.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  // iOS shows every push or stops delivering them, so there is always a
  // notification here — never a silent update.
  const work = [
    self.registration.showNotification(data.title || 'CHRGD Founders Hub', {
      body: data.body || '',
      tag: data.tag,
      icon: '/founderhub-icon-192.png',
      data: { url: data.url || '/founderhub' },
    }),
  ]

  // The number on the Home Screen icon: orders waiting for review.
  if (typeof data.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
    work.push(data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge())
  }

  event.waitUntil(Promise.allSettled(work))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/founderhub', self.location.origin)
  // Hub pages only, whatever the message said.
  if (target.origin !== self.location.origin || !target.pathname.startsWith('/founderhub')) return

  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of open) {
        try {
          await client.focus()
          await client.navigate(target.href)
          return
        } catch {
          // Not ours to steer — fall through and open a fresh window.
        }
      }
      await self.clients.openWindow(target.href)
    })(),
  )
})
