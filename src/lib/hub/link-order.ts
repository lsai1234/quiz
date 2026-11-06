/**
 * Joining an order made under another email to this account (server-only).
 *
 * The member gives the email they ordered with; a 6-digit code goes to that
 * inbox; entering it here moves those orders onto this account. The code is
 * kept only as a hash, works for 15 minutes and five tries, and the same
 * answer comes back whether or not that email has orders, so the form can't
 * be used to find out who has bought from us. Orders already on another
 * account are never moved.
 */
import { createHash, randomInt } from 'node:crypto'
import { kvDelete, kvGet, kvSet } from '@/lib/db/kv'

const TTL_MS = 15 * 60_000
const MAX_TRIES = 5
const key = (userId: string) => `link-code:${userId}`
const hash = (code: string) => createHash('sha256').update(code).digest('hex')
const norm = (e: string) => e.trim().toLowerCase()

interface Pending {
  email: string
  codeHash: string
  expires: number
  tries: number
}

export type LinkResult = { ok: true; linked: number } | { ok: false; reason: 'wrong' | 'expired' | 'tries' }

/** Start: a code for that email, sent only when it has orders this account could take. */
export async function startLink(user: { id: string; email: string | null }, email: string, now = Date.now()): Promise<{ sent: boolean }> {
  const target = norm(email)
  if (!/\S+@\S+\.\S+/.test(target) || target === norm(user.email ?? '')) return { sent: false }
  const { listPaidOrdersFor } = await import('@/lib/orders/repo')
  const orders = (await listPaidOrdersFor({ email: target }, '1970-01-01T00:00:00.000Z', 50)).filter((o) => !o.userId || o.userId === user.id)
  if (!orders.length) return { sent: false }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await kvSet<Pending>(key(user.id), { email: target, codeHash: hash(code), expires: now + TTL_MS, tries: 0 })
  const [{ queueNotification, deliverIfAutomatic }, { emailShell }, { appBaseUrl }, { HUB_COPY: H }] = await Promise.all([
    import('@/lib/notify/outbox'),
    import('@/lib/notify/brand'),
    import('@/lib/notify'),
    import('./copy'),
  ])
  const shell = emailShell({
    preheader: H.codeEmailIntro(code),
    heading: H.codeEmailHeading,
    intro: H.codeEmailIntro(code),
    paragraphs: [H.codeEmailIgnore],
    links: { base: appBaseUrl(), optOutUrl: null },
    marketing: null,
  })
  const queued = await queueNotification({
    userId: user.id,
    email: target,
    template: 'order-link-code',
    dedupeKey: `order-link-code:${user.id}:${now}`,
    rendered: { subject: H.codeEmailSubject, ...shell },
  })
  await deliverIfAutomatic(queued)
  return { sent: true }
}

/** Finish: the right code moves that email's unclaimed orders onto this account. */
export async function finishLink(user: { id: string }, code: string, now = Date.now()): Promise<LinkResult> {
  const p = await kvGet<Pending>(key(user.id))
  if (!p || p.expires < now) return { ok: false, reason: 'expired' }
  if (p.tries >= MAX_TRIES) return { ok: false, reason: 'tries' }
  if (!/^\d{6}$/.test(code.trim()) || hash(code.trim()) !== p.codeHash) {
    await kvSet<Pending>(key(user.id), { ...p, tries: p.tries + 1 })
    return { ok: false, reason: p.tries + 1 >= MAX_TRIES ? 'tries' : 'wrong' }
  }
  await kvDelete(key(user.id))
  const { listPaidOrdersFor, updateOrder } = await import('@/lib/orders/repo')
  const orders = (await listPaidOrdersFor({ email: p.email }, '1970-01-01T00:00:00.000Z', 200)).filter((o) => !o.userId)
  for (const o of orders) await updateOrder(o.id, (x) => void (x.userId = user.id))
  return { ok: true, linked: orders.length }
}
