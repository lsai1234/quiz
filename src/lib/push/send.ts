/**
 * Send one notification to every founder device.
 *
 * Best-effort by design, and it never throws: this runs inside the request that
 * took a customer's money, and a push service being slow or down is not a
 * reason for that request to fail. Every send has a timeout and they run side
 * by side, so the worst case is a few seconds, once.
 *
 * Dead devices are cleaned up as we go. The push service answers 404 or 410
 * for a subscription that no longer exists (the hub was removed from the Home
 * Screen, notifications were turned off in iOS Settings), and keeping those
 * would mean trying, and failing, on every order forever.
 */
import { getVapidKeys, vapidSubject } from './keys'
import {
  listDevices,
  recordDelivered,
  recordFailed,
  removeDevice,
  type PushDevice,
} from './devices'

/** What the service worker (`public/founderhub-sw.js`) reads. */
export interface PushMessage {
  title: string
  body: string
  /** Where tapping it goes. Always a hub path. */
  url: string
  /** Same tag replaces rather than stacks — a resent order is one notification. */
  tag: string
  /** Orders waiting for review, for the number on the Home Screen icon. */
  badge?: number
}

export interface SendResult {
  /** Devices it reached the push service for. */
  sent: number
  /** Devices that refused or timed out, kept and marked. */
  failed: number
  /** Devices that no longer exist, removed. */
  removed: number
  /** Nobody has turned notifications on, so nothing was tried. */
  notSetUp: boolean
}

const SEND_TIMEOUT_MS = 5000
/** Keep an undelivered notification this long for a phone that is off. */
const TTL_SECONDS = 24 * 60 * 60

export async function sendToDevices(
  message: PushMessage,
  only?: (device: PushDevice) => boolean,
): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, removed: 0, notSetUp: false }
  try {
    const keys = await getVapidKeys()
    const devices = (await listDevices()).filter((d) => (only ? only(d) : true))
    if (!keys || devices.length === 0) return { ...result, notSetUp: true }

    const { default: webpush } = await import('web-push')
    const payload = JSON.stringify(message)
    const options = {
      vapidDetails: { subject: vapidSubject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: TTL_SECONDS,
      urgency: 'high' as const,
      timeout: SEND_TIMEOUT_MS,
    }

    await Promise.all(
      devices.map(async (device) => {
        try {
          await webpush.sendNotification(
            { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
            payload,
            options,
          )
          await recordDelivered(device.id)
          result.sent += 1
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            await removeDevice(device.id)
            result.removed += 1
            return
          }
          await recordFailed(device.id, describe(err, status))
          result.failed += 1
        }
      }),
    )
  } catch (err) {
    console.error('[push] could not send:', err)
  }
  return result
}

/**
 * A line a founder can act on. Apple's own reasons ("BadJwtToken",
 * "ExpiredProviderToken") arrive in the response body and are the only clue
 * when a phone stops getting anything, so they are kept.
 */
function describe(err: unknown, status: number | undefined): string {
  const body = (err as { body?: string }).body
  const message = err instanceof Error ? err.message : String(err)
  return [status ? `HTTP ${status}` : null, body?.trim() || message].filter(Boolean).join(' · ')
}
