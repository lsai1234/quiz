/**
 * The member hub's numbers, for the founders (server-only): who has a hub,
 * who used it this week, deals used against full-price reorders, and
 * training. Counted from what's already stored; nothing new is tracked about
 * anyone beyond the date they last opened their hub.
 */
import { kvListPrefix } from '@/lib/db/kv'

const DAY = 86_400_000

export interface HubMetrics {
  /** Customers with an order in the last 90 days, plus running plans. */
  openHubs: number
  /** Opened their hub in the last 7 days. */
  activeThisWeek: number
  dealsUsed30: number
  dealOrdersValue30: number
  /** What members saved with deals in the last 30 days (£). */
  dealSavings30: number
  /** Repeat orders from members at full price in the last 30 days. */
  fullPriceReorders30: number
  dealEmailsSent30: number
  trainingPlans: number
  trainingActiveThisWeek: number
}

export async function hubMetrics(now = new Date()): Promise<HubMetrics> {
  const since90 = new Date(now.getTime() - 90 * DAY).toISOString()
  const since30 = new Date(now.getTime() - 30 * DAY).toISOString()
  const [{ listRecentCustomers, listOrders }, { listActiveSubscriptions }, { listNotifications }] = await Promise.all([
    import('@/lib/orders/repo'),
    import('@/lib/db/hub-data'),
    import('@/lib/notify/outbox'),
  ])
  const [customers, subs, seen, orders, notes] = await Promise.all([
    listRecentCustomers(since90),
    listActiveSubscriptions().catch(() => []),
    kvListPrefix<{ at: string }>('hub-seen:', 20_000),
    listOrders({ limit: 500 }),
    listNotifications({ limit: 500 }).catch(() => []),
  ])
  const recent = orders.filter((o) => o.createdAt >= since30 && !['pending_payment', 'cancelled', 'failed', 'refunded'].includes(o.status))
  const deals = recent.filter((o) => o.memberDeal)
  // A full-price reorder: someone who had ordered in the 90 days before, buying again with no deal.
  const byEmail = new Map<string, string[]>()
  for (const o of orders) if (o.email) byEmail.set(o.email.toLowerCase(), [...(byEmail.get(o.email.toLowerCase()) ?? []), o.createdAt])
  const fullPrice = recent.filter((o) => {
    if (o.memberDeal || o.lastChance || !o.email || o.channel === 'subscription') return false
    const t = Date.parse(o.createdAt)
    return (byEmail.get(o.email.toLowerCase()) ?? []).some((c) => Date.parse(c) < t && t - Date.parse(c) <= 90 * DAY)
  })

  // Sample members (Settings → Test views) never count.
  const { sampleMemberIds } = await import('@/lib/samples/registry')
  const samples = await sampleMemberIds()
  const real = <T,>(rows: { key: string; value: T }[], prefix: string) => rows.filter((r) => !samples.has(r.key.slice(prefix.length)))
  const plans = real(await kvListPrefix<{ plan: { weekOf: string; sessions: { done: boolean }[] } | null }>('training:', 20_000), 'training:')
  const monday = (() => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    return d.toISOString().slice(0, 10)
  })()

  return {
    openHubs: customers.length + subs.length,
    activeThisWeek: real(seen, 'hub-seen:').filter((s) => s.value?.at && now.getTime() - Date.parse(s.value.at) <= 7 * DAY).length,
    dealsUsed30: deals.length,
    dealOrdersValue30: Math.round(deals.reduce((s, o) => s + o.total, 0) * 100) / 100,
    dealSavings30: Math.round(deals.reduce((s, o) => s + Math.max(0, (o.memberDeal?.normalTotal ?? 0) - (o.memberDeal?.total ?? 0)), 0) * 100) / 100,
    fullPriceReorders30: fullPrice.length,
    dealEmailsSent30: notes.filter((n) => n.template === 'deal-open' && n.createdAt >= since30).length,
    trainingPlans: plans.filter((p) => p.value?.plan).length,
    trainingActiveThisWeek: plans.filter((p) => p.value?.plan?.weekOf === monday && p.value.plan.sessions.some((s) => s.done)).length,
  }
}
