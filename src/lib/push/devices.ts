/**
 * The phones (and any other browsers) that get founder notifications.
 *
 * One row per push subscription, keyed by a hash of its endpoint so the same
 * phone turning notifications on twice updates its row rather than buzzing
 * twice for every order.
 */
import crypto from 'crypto'
import { getEngine, now } from '@/lib/db/engine'

export interface PushDevice {
  id: string
  founderEmail: string
  /** "Sam · iPhone" — enough to tell two phones apart in the list. */
  label: string
  endpoint: string
  p256dh: string
  auth: string
  createdAt: string
  lastOkAt: string | null
  lastError: string | null
  lastErrorAt: string | null
}

/** What the browser's `PushSubscription.toJSON()` gives us. */
export interface BrowserSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

interface Row {
  id: string
  founder_email: string
  label: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
  last_ok_at: string | null
  last_error: string | null
  last_error_at: string | null
}

function fromRow(r: Row): PushDevice {
  return {
    id: r.id,
    founderEmail: r.founder_email,
    label: r.label,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
    createdAt: r.created_at,
    lastOkAt: r.last_ok_at,
    lastError: r.last_error,
    lastErrorAt: r.last_error_at,
  }
}

export function deviceIdFor(endpoint: string): string {
  return `dev_${crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 16)}`
}

/**
 * Refuse anything that is not a push subscription from a real push service.
 *
 * The endpoint is a URL we will POST to on every order, so it is checked as
 * one: https only. That stops a hub session being used to point our server at
 * an address of its choosing.
 */
export function parseSubscription(input: unknown): BrowserSubscription | null {
  if (!input || typeof input !== 'object') return null
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return null
  try {
    if (new URL(endpoint).protocol !== 'https:') return null
  } catch {
    return null
  }
  const p256dh = keys?.p256dh
  const auth = keys?.auth
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null
  if (!/^[A-Za-z0-9_-]+=*$/.test(p256dh) || !/^[A-Za-z0-9_-]+=*$/.test(auth)) return null
  return { endpoint, keys: { p256dh, auth } }
}

/** Add a device, or refresh one we already have. */
export async function saveDevice(input: {
  founderEmail: string
  label: string
  subscription: BrowserSubscription
}): Promise<PushDevice> {
  const db = await getEngine()
  const id = deviceIdFor(input.subscription.endpoint)
  await db.run(
    `INSERT INTO push_devices (id, founder_email, label, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       founder_email = excluded.founder_email,
       label = excluded.label,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       last_error = NULL,
       last_error_at = NULL`,
    [
      id,
      input.founderEmail,
      input.label,
      input.subscription.endpoint,
      input.subscription.keys.p256dh,
      input.subscription.keys.auth,
      now(),
    ],
  )
  return (await getDevice(id))!
}

export async function getDevice(id: string): Promise<PushDevice | null> {
  const db = await getEngine()
  const row = await db.get<Row>('SELECT * FROM push_devices WHERE id = ?', [id])
  return row ? fromRow(row) : null
}

export async function listDevices(): Promise<PushDevice[]> {
  const db = await getEngine()
  const rows = await db.all<Row>('SELECT * FROM push_devices ORDER BY created_at ASC')
  return rows.map(fromRow)
}

export async function removeDevice(id: string): Promise<void> {
  const db = await getEngine()
  await db.run('DELETE FROM push_devices WHERE id = ?', [id])
}

export async function recordDelivered(id: string): Promise<void> {
  const db = await getEngine()
  await db.run(
    'UPDATE push_devices SET last_ok_at = ?, last_error = NULL, last_error_at = NULL WHERE id = ?',
    [now(), id],
  )
}

export async function recordFailed(id: string, error: string): Promise<void> {
  const db = await getEngine()
  await db.run('UPDATE push_devices SET last_error = ?, last_error_at = ? WHERE id = ?', [
    error.slice(0, 300),
    now(),
    id,
  ])
}

/**
 * "iPhone", "iPad", "Mac"… from the browser's user agent — a label, not a
 * fingerprint, and only ever shown back to the founders.
 */
export function deviceKind(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ''
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android phone'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  return 'Browser'
}
