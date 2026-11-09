/**
 * Sample members (server-only): accounts on the sample domain, one per test
 * scenario, kept apart from real ones. Their orders and box plans live here,
 * in the kv store, never in the orders or subscriptions tables, so nothing
 * of theirs can reach the fulfilment queue, the supplier, Stripe or the
 * Founders Hub's numbers. The orders repo and the hub's plan store read from
 * here for them (`orders/repo`, `db/hub-data`).
 */
import { kvDelete, kvGet, kvSet } from '@/lib/db/kv'
import type { Order } from '@/lib/orders/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import { isSampleEmail } from './domain'

const MEMBERS = 'sample-members'
const ordersKey = (userId: string) => `sample-orders:${userId}`
const subKey = (userId: string) => `sample-sub:${userId}`
const orderKey = (id: string) => `sample-order:${id}`

let cache: { at: number; ids: Set<string> } | null = null
const CACHE_MS = 15_000

/** Scenario → user id. */
export async function sampleMembers(): Promise<Record<string, string>> {
  return (await kvGet<Record<string, string>>(MEMBERS)) ?? {}
}

export async function sampleMemberIds(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ids
  const ids = new Set(Object.values(await sampleMembers()))
  cache = { at: Date.now(), ids }
  return ids
}

export async function isSampleUserId(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  return (await sampleMemberIds()).has(userId)
}

/** A sample member by either handle: their address, or their account. */
export async function isSampleMember(who: { userId?: string | null; email?: string | null }): Promise<boolean> {
  return isSampleEmail(who.email) || (await isSampleUserId(who.userId))
}

export async function registerSampleMember(scenario: string, userId: string): Promise<void> {
  const all = await sampleMembers()
  all[scenario] = userId
  await kvSet(MEMBERS, all)
  cache = null
}

/** A sample member's orders, by account or, failing that, by their sample address. */
export async function sampleOrdersFor(who: { userId?: string | null; email?: string | null }): Promise<Order[]> {
  let userId = who.userId ?? null
  if (!userId && who.email) {
    const { getUserByEmail } = await import('@/lib/db/users')
    userId = (await getUserByEmail(who.email))?.id ?? null
  }
  return userId ? getSampleOrders(userId) : []
}

export async function getSampleOrders(userId: string): Promise<Order[]> {
  return (await kvGet<Order[]>(ordersKey(userId))) ?? []
}

export async function setSampleOrders(userId: string, orders: Order[]): Promise<void> {
  for (const o of await getSampleOrders(userId)) await kvDelete(orderKey(o.id))
  if (orders.length) await kvSet(ordersKey(userId), orders)
  else await kvDelete(ordersKey(userId))
  for (const o of orders) await kvSet(orderKey(o.id), o)
}

/** Sample order ids all start this way, so nothing real can be mistaken for one. */
export const SAMPLE_ORDER_PREFIX = 'sample_'

export async function getSampleOrder(id: string): Promise<Order | null> {
  if (!id.startsWith(SAMPLE_ORDER_PREFIX)) return null
  return (await kvGet<Order>(orderKey(id))) ?? null
}

export async function getSampleSubscription(userId: string): Promise<MemberSubscription | null> {
  return (await kvGet<MemberSubscription>(subKey(userId))) ?? null
}

export async function setSampleSubscription(userId: string, sub: MemberSubscription | null): Promise<void> {
  if (sub) await kvSet(subKey(userId), sub)
  else await kvDelete(subKey(userId))
}

/** Sample members can't pay, and nor can a browser with a test view open. A sentence to show, or null. */
export async function testCheckoutRefusal(who: { userId?: string | null; email?: string | null } | null): Promise<string | null> {
  if (who && (await isSampleMember(who))) return 'This is a sample account in a test view, so it can’t pay. Leave the test view to buy for real.'
  const { currentTestView } = await import('./session')
  if (await currentTestView()) return 'A test view is open in this browser, so payments are switched off here. Leave the test view to buy for real.'
  return null
}
