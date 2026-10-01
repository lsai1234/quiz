/**
 * The browser side of the hub as a Home Screen app: the service worker, push
 * permission and the icon badge. Shared by `HubApp` (always mounted) and
 * `NotificationSettings` (the page that turns it on).
 *
 * Everything here is feature-tested rather than assumed. Push on an iPhone only
 * exists once the hub has been added to the Home Screen — in a Safari tab,
 * `PushManager` is simply absent — so "can this browser do it?" and "is this
 * the installed app?" are separate questions with separate answers to show.
 */

const WORKER_URL = '/founderhub-sw.js'
const WORKER_SCOPE = '/founderhub'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Opened from the Home Screen icon rather than in a browser tab. */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

export function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  // iPadOS reports itself as a Mac; the touch points give it away.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}

let registering: Promise<ServiceWorkerRegistration | null> | null = null

/** Register the hub's worker once per page load. Null where there is no worker. */
export function hubWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null)
  registering ??= navigator.serviceWorker
    .register(WORKER_URL, { scope: WORKER_SCOPE })
    .then(() => navigator.serviceWorker.ready)
    .catch(() => null)
  return registering
}

/** This browser's current push subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await hubWorker()
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** The number on the Home Screen icon. A no-op where badges do not exist. */
export async function setIconBadge(count: number): Promise<void> {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
  try {
    if (count > 0) await nav.setAppBadge?.(count)
    else await nav.clearAppBadge?.()
  } catch {
    // Badging is a nicety; a browser that refuses it changes nothing else.
  }
}

/** The server's public key, as `pushManager.subscribe` wants it. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
