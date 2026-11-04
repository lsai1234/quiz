/**
 * Issuing the stack guide when an order is paid: one-off orders at the move to
 * paid (`confirmByEmail` in `lib/orders/service`), plans when their
 * confirmation is queued (`queueSubscriptionConfirmation`).
 *
 * Once per order or plan: the token is kept on the record, so a webhook
 * redelivery finds it and sends nothing new. The guide is made whether or not
 * there is an email to send it to (a guest's mock order has none), because the
 * confirmation page links to it too. The email is deduped on the guide's token
 * and goes out with the confirmation, through the same outbox, allowlist and
 * all. Never throws: a guide that can't be made must not cost anyone an order.
 */
import type { Order } from '@/lib/orders/types'
import type { MemberSubscription } from '@/lib/recharge/types'
import { appBaseUrl } from '@/lib/notify'
import { buildGuide, normaliseGuideSeed, type GuideLine, type StackGuide } from './build'
import { newGuideToken, saveGuide } from './store'

export function guideLinks(token: string, base = appBaseUrl()) {
  return {
    page: `${base}/guide/${token}`,
    image: `${base}/api/guide/${token}/image`,
    calendar: `${base}/api/guide/${token}/calendar`,
  }
}

async function makeGuide(plan: StackGuide['plan'], lines: GuideLine[], seedRaw: unknown): Promise<StackGuide | null> {
  const [{ getResolvedCatalogue }, { guideServices }] = await Promise.all([import('@/lib/catalogue/resolve'), import('./services')])
  const { products } = await getResolvedCatalogue()
  const seed = normaliseGuideSeed(seedRaw)
  const productIds = new Set(lines.map((l) => l.productId))
  const guide = buildGuide({
    token: newGuideToken(),
    now: new Date().toISOString(),
    plan,
    lines,
    seed,
    catalogue: products,
    services: await guideServices(plan, products.filter((p) => productIds.has(p.id))),
  })
  if (guide.products.length === 0) return null
  await saveGuide(guide)
  return guide
}

async function sendGuide(guide: StackGuide, to: string, userId: string | null): Promise<void> {
  const [{ queueNotification, deliverIfAutomatic }, { stackGuideEmail }] = await Promise.all([
    import('@/lib/notify/outbox'),
    import('./email'),
  ])
  const base = appBaseUrl()
  const queued = await queueNotification({
    userId,
    email: to,
    template: 'stack-guide',
    dedupeKey: `stack-guide:${guide.token}`,
    rendered: stackGuideEmail(guide, guideLinks(guide.token, base), { baseUrl: base }),
  })
  await deliverIfAutomatic(queued)
}

/** A paid one-off order: its guide, once, and the email when there is an address. */
export async function issueGuideForOrder(order: Order): Promise<string | null> {
  try {
    if (order.status !== 'paid' || order.channel === 'subscription') return order.guideToken ?? null
    if (order.guideToken) return order.guideToken
    // The bonus is a gift, not part of their routine; they find it on the receipt.
    const lines = order.lines.filter((l) => !l.bonus).map((l) => ({ productId: l.productId }))
    const guide = await makeGuide('oneoff', lines, order.guideSeed)
    if (!guide) return null
    const { updateOrder } = await import('@/lib/orders/repo')
    await updateOrder(order.id, (o) => {
      o.guideToken = guide.token
    })
    if (order.email) await sendGuide(guide, order.email, order.userId)
    return guide.token
  } catch (err) {
    console.error('[guide] could not issue the guide for an order:', err)
    return null
  }
}

/** A plan that has just started: its guide, once, to the member's address. */
export async function issueGuideForSubscription(userId: string, sub: MemberSubscription, email: string | null): Promise<string | null> {
  try {
    if (sub.guideToken) return sub.guideToken
    const lines = sub.lines.map((l) => ({ productId: l.productId, usage: l.usageLevel ?? null }))
    const guide = await makeGuide('subscription', lines, sub.guideSeed)
    if (!guide) return null
    const { getSubscription, saveSubscription } = await import('@/lib/db/hub-data')
    const current = await getSubscription(userId)
    if (current) await saveSubscription(userId, { ...current, guideToken: guide.token })
    const to = sub.customerEmail || email
    if (to) await sendGuide(guide, to, userId)
    return guide.token
  } catch (err) {
    console.error('[guide] could not issue the guide for a plan:', err)
    return null
  }
}
