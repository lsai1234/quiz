/**
 * "New order · £26.94" on the founders' phones.
 *
 * Called from the one funnel every paid order passes through — next to the
 * customer's confirmation email in `lib/orders/service.ts` — so the shop, the
 * quiz, subscription boxes and free orders all notify, and no future checkout
 * can quietly skip it.
 *
 * What a notification may say is narrower than what the hub shows. It lands on
 * a lock screen that anyone at the table can read, so it carries the amount,
 * the first item and our order reference — never the customer's name, email or
 * address.
 */
import type { Order } from '@/lib/orders/types'
import type { PushMessage } from './send'
import type { PushPrefs } from './prefs'

export type OrderAlertKind = 'order' | 'free-order' | 'subscriber' | 'renewal'

function money(amount: number, currency: string): string {
  const fixed = amount.toFixed(2)
  return currency === 'GBP' ? `£${fixed}` : `${fixed} ${currency}`
}

/** "Creatine and 2 more" — what is in it, in a few words. */
function itemsLine(order: Pick<Order, 'lines'>): string {
  const [first, ...rest] = order.lines
  if (!first) return 'Nothing ships this month'
  const name = first.quantity > 1 ? `${first.quantity} × ${first.title}` : first.title
  return rest.length > 0 ? `${name} and ${rest.length} more` : name
}

function reference(order: Pick<Order, 'id' | 'reference'>): string {
  return order.reference ?? order.id
}

/** What sort of news this order is. */
export function alertKindOf(order: Order): OrderAlertKind {
  if (order.channel === 'subscription') {
    return order.subscription?.cycle === 0 ? 'subscriber' : 'renewal'
  }
  const free = order.founderCodeKind === 'free' || Boolean(order.starterCode) || order.total <= 0
  return free ? 'free-order' : 'order'
}

/** Whether the founders asked to hear about this kind. */
export function wanted(kind: OrderAlertKind, prefs: PushPrefs): boolean {
  if (kind === 'subscriber') return prefs.subscribers
  if (kind === 'renewal') return prefs.renewals
  return prefs.orders
}

/** The notification for a paid order. Pure — the badge is added by the caller. */
export function orderAlert(order: Order): PushMessage {
  const kind = alertKindOf(order)
  const url = `/founderhub/commerce/orders/${order.id}`
  const tag = `order-${order.id}`
  const ref = reference(order)

  if (kind === 'subscriber') {
    const monthly = order.subscription?.monthly ?? order.billedAmount ?? order.total
    return {
      title: `New subscriber · ${money(monthly, order.currency)}/month`,
      body: `First box: ${itemsLine(order)} · ${ref}`,
      url,
      tag,
    }
  }
  if (kind === 'renewal') {
    const billed = order.billedAmount ?? order.total
    return {
      title: `Renewal · ${money(billed, order.currency)}`,
      body: `${itemsLine(order)} · ${ref}`,
      url,
      tag,
    }
  }
  if (kind === 'free-order') {
    const why = order.starterCode ? 'Partner starter' : order.founderCode ? 'Founder code' : 'No charge'
    return {
      title: 'Free order to review',
      body: `${why} · ${itemsLine(order)} · ${ref}`,
      url,
      tag,
    }
  }
  const from = order.channel === 'quiz' ? 'Quiz' : 'Shop'
  return {
    title: `New order · ${money(order.total, order.currency)}`,
    body: `${from} · ${itemsLine(order)} · ${ref}`,
    url,
    tag,
  }
}

/**
 * Tell the founders about a newly paid order. NEVER throws, never blocks the
 * order — exactly like the confirmation email it sits beside.
 *
 * Claims the order first (`foundersAlertedAt`), so a repeated call — a webhook
 * Stripe delivers twice, two routes racing — sends one notification, not two.
 * The claim is skipped entirely until somebody has turned notifications on,
 * so an order raised before then is not marked as told when nobody was.
 */
export async function alertFoundersOfOrder(order: Order): Promise<void> {
  try {
    const { getVapidKeys } = await import('./keys')
    if (!(await getVapidKeys())) return

    const { getPushPrefs } = await import('./prefs')
    if (!wanted(alertKindOf(order), await getPushPrefs())) return

    const { updateOrder } = await import('@/lib/orders/repo')
    let claimed = false
    await updateOrder(order.id, (o) => {
      if (o.foundersAlertedAt) return
      o.foundersAlertedAt = new Date().toISOString()
      claimed = true
    })
    if (!claimed) return

    const { reviewCount } = await import('./badge')
    const { sendToDevices } = await import('./send')
    await sendToDevices({ ...orderAlert(order), badge: await reviewCount() })
  } catch (err) {
    console.error('[push] order alert failed:', err)
  }
}
