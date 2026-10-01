'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { currentSubscription, hubWorker, isInstalledApp, setIconBadge } from './hub-app'

/**
 * The hub's life as a Home Screen app, kept current while it is open. Renders
 * nothing.
 *
 * Two jobs:
 *
 *  • The icon badge. A notification sets it when an order arrives, but nothing
 *    can lower it while the app is closed — so it is re-read here whenever the
 *    hub is opened, brought back to the front, or moved between pages (which is
 *    what happens after approving an order). Clearing the queue clears the icon.
 *
 *  • The phone's push subscription. iOS can replace one without saying so, and
 *    the server drops one that a push service has refused. Re-sending it on open
 *    heals both, so a phone that has notifications on stays on the list.
 */
export function HubApp() {
  const pathname = usePathname()

  useEffect(() => {
    void hubWorker()
    void (async () => {
      const sub = await currentSubscription()
      if (!sub || Notification.permission !== 'granted') return
      await fetch('/api/portal/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', subscription: sub.toJSON(), quiet: true }),
      }).catch(() => {})
    })()
  }, [])

  useEffect(() => {
    if (!isInstalledApp()) return
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      fetch('/api/portal/push/badge')
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { reviewCount?: number } | null) => {
          if (typeof d?.reviewCount === 'number') void setIconBadge(d.reviewCount)
        })
        .catch(() => {})
    }
    refresh()
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [pathname])

  return null
}
