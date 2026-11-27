/**
 * Adding something to a subscriber's next box, from the shop or the hub.
 *
 * It ships in that box, so it adds no delivery charge, and it is paid for with
 * that box: for a plan Stripe bills, an invoice item on the subscription, which
 * Stripe adds to the next payment. The renewal box then packs whatever that
 * payment actually paid for (`extrasFromInvoice`, read by the webhook), so what
 * ships is what was charged even if the item lands on a later payment than
 * planned.
 *
 * The hub's calendar used to offer "add to this box" by writing a product id
 * onto the plan, and nothing read it but the calendar: it was never charged and
 * never packed. This is the version that is both.
 *
 * Only the next box takes extras on a plan Stripe bills. Stripe puts a pending
 * invoice item on the next invoice it makes, whichever box that is, so an extra
 * for the box after would be charged a month early.
 *
 * Priced here, from the catalogue, never from what the browser sent: the same
 * price the hub's calendar quotes for "just this box" (the plan's own saving,
 * floored), for the variant chosen.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { BoxExtra, MemberSubscription } from '@/lib/recharge/types'
import type { OrderLine } from '@/lib/orders/types'
import { buildDeliverySchedule, nextDelivery } from '@/lib/recharge/schedule'
import { type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { extraPrice, tryPrice } from './extra-price'
import { tryBlocker, tryWaiting } from './try-rules'
import { storedRateOf } from '@/lib/recharge/plan-rate'

/** Enough for a real top-up, few enough that a box stays a box. */
export const MAX_BOX_EXTRAS = 8

const round = (n: number) => Math.round(n * 100) / 100

export { extraPrice }

/** The box extras go in: the next one that will ship, and when. */
export function nextBox(sub: MemberSubscription, catalogue: CatalogueProduct[], now: Date = new Date()): { id: string; date: string } | null {
  const box = nextDelivery(buildDeliverySchedule(sub, catalogue, 3, now))
  return box ? { id: box.id, date: box.date } : null
}

export type AddRefusal =
  | 'no-plan'
  | 'not-active'
  | 'no-box'
  | 'unknown-product'
  | 'not-for-sale'
  | 'sold-out'
  | 'full'
  | 'try-not-offered'

export const ADD_REFUSAL_COPY: Record<AddRefusal, string> = {
  'no-plan': 'There’s no plan on this account to add to.',
  'not-active': 'Your plan is paused or has ended, so there’s no box to add to right now.',
  'no-box': 'There’s no box coming up to add to.',
  'unknown-product': 'We couldn’t find that product.',
  'not-for-sale': 'That product can’t be added to a box.',
  'sold-out': 'That’s sold out just now.',
  full: `Your next box already has ${MAX_BOX_EXTRAS} extras in it, which is as many as one box takes.`,
  'try-not-offered': 'That first-time price isn’t available for this product just now. You can still add it to your box at your plan price.',
}

/**
 * Work out an extra for the next box: which box, what it costs, and the extra
 * as it will be stored. Pure; the caller charges for it and saves the plan.
 */
export function planExtra(input: {
  sub: MemberSubscription | null
  catalogue: CatalogueProduct[]
  productId: string
  variantId?: string | null
  now?: Date
  config?: PricingConfig
  /** 'try': at its first-time price ("try something new"), if it's offered for this product. */
  offer?: 'try' | null
  /** The founders' switch and size for trying something new. */
  tryNew?: { on: boolean; maxPct: number }
}): { ok: true; box: { id: string; date: string }; extra: BoxExtra } | { ok: false; reason: AddRefusal } {
  const { sub, catalogue } = input
  const now = input.now ?? new Date()
  if (!sub) return { ok: false, reason: 'no-plan' }
  if (sub.status !== 'active') return { ok: false, reason: 'not-active' }
  const product = catalogue.find((p) => p.id === input.productId)
  if (!product) return { ok: false, reason: 'unknown-product' }
  // What a plan can carry at all: not a subscription-only stand-in, and sold one at a time.
  if (product.isSubscriptionOnly || product.subscriptionEligible === false) return { ok: false, reason: 'not-for-sale' }
  const variant = input.variantId
    ? product.variants.find((v) => v.id === input.variantId)
    : product.variants.find((v) => v.available) ?? product.variants[0]
  if (!variant) return { ok: false, reason: 'unknown-product' }
  if (!variant.available) return { ok: false, reason: 'sold-out' }
  const box = nextBox(sub, catalogue, now)
  if (!box) return { ok: false, reason: 'no-box' }
  if ((sub.deliveryOverrides?.[box.id]?.addedItems ?? []).length >= MAX_BOX_EXTRAS) return { ok: false, reason: 'full' }
  // Their own plan saving, on anything they add (`extraPrice`).
  let price = extraPrice(product, variant, input.config, storedRateOf(sub, input.config))
  let kind: 'try' | undefined
  if (input.offer === 'try') {
    // The first-time price, re-checked here whatever the hub was shown (`try-new`).
    const settings = input.tryNew
    if (!settings?.on || tryBlocker(sub, product) || tryWaiting(sub)) return { ok: false, reason: 'try-not-offered' }
    const first = tryPrice(product, variant, settings.maxPct, input.config)
    if (first > price - 0.5) return { ok: false, reason: 'try-not-offered' }
    price = first
    kind = 'try'
  }
  const extra: BoxExtra = {
    id: `x-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    productId: product.id,
    variantId: variant.id,
    sku: variant.sku ?? null,
    title: product.title,
    variantTitle: [variant.flavour, variant.size].filter(Boolean).join(' · ') || null,
    price,
    invoiceItemId: null,
    addedAt: now.toISOString(),
    ...(kind ? { kind } : {}),
  }
  return { ok: true, box, extra }
}

/** The plan with an extra in a box. */
export function withExtra(sub: MemberSubscription, boxId: string, extra: BoxExtra): MemberSubscription {
  const current = sub.deliveryOverrides?.[boxId] ?? {}
  return {
    ...sub,
    deliveryOverrides: {
      ...sub.deliveryOverrides,
      [boxId]: { ...current, addedItems: [...(current.addedItems ?? []), extra] },
    },
  }
}

/** The plan without one extra, and the extra that came out (to un-charge it). */
export function withoutExtra(sub: MemberSubscription, extraId: string): { sub: MemberSubscription; removed: BoxExtra | null } {
  for (const [boxId, override] of Object.entries(sub.deliveryOverrides ?? {})) {
    const found = (override.addedItems ?? []).find((x) => x.id === extraId)
    if (!found) continue
    return {
      sub: {
        ...sub,
        deliveryOverrides: {
          ...sub.deliveryOverrides,
          [boxId]: { ...override, addedItems: (override.addedItems ?? []).filter((x) => x.id !== extraId) },
        },
      },
      removed: found,
    }
  }
  return { sub, removed: null }
}

/**
 * Keep the extras as stored when the hub saves a whole plan.
 *
 * `PUT /api/hub/subscription` takes the plan from the browser, and an extra is
 * money: a browser that could write one would ship something nobody paid for,
 * and one that could drop one would leave a charge with no box behind it. So
 * extras are only ever added or taken out by `/api/hub/next-box`, and a save
 * carries the stored ones over.
 *
 * A box the member has just skipped is the exception: its extras come out with
 * it (the caller un-charges them, see `extrasDroppedBySkip`), because a skipped
 * box sends nothing.
 */
export function keepStoredExtras(previous: MemberSubscription, incoming: MemberSubscription): MemberSubscription {
  const before = previous.deliveryOverrides ?? {}
  const after = { ...(incoming.deliveryOverrides ?? {}) }
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const stored = before[id]?.addedItems
    const skipped = after[id]?.skipped === true
    if (after[id]) {
      const { addedItems: _ignored, ...rest } = after[id]
      void _ignored
      after[id] = stored?.length && !skipped ? { ...rest, addedItems: stored } : rest
    } else if (stored?.length) {
      after[id] = { addedItems: stored }
    }
  }
  return { ...incoming, deliveryOverrides: after }
}

/** The extras a save takes out because their box was skipped: each to be un-charged. */
export function extrasDroppedBySkip(previous: MemberSubscription, next: MemberSubscription): BoxExtra[] {
  const out: BoxExtra[] = []
  for (const [id, override] of Object.entries(previous.deliveryOverrides ?? {})) {
    if (!override.addedItems?.length) continue
    if (next.deliveryOverrides?.[id]?.skipped === true && override.skipped !== true) out.push(...override.addedItems)
  }
  return out
}

/** The metadata an extra's invoice item carries, so the box that payment pays for packs it. */
export function extraMetadata(extra: BoxExtra): Record<string, string> {
  return {
    chrgd_box_extra: '1',
    chrgd_extra_id: extra.id,
    chrgd_product_id: extra.productId,
    chrgd_variant_id: extra.variantId ?? '',
    chrgd_sku: extra.sku ?? '',
  }
}

/**
 * The extras a paid invoice paid for, as order lines for the box it raises.
 *
 * Read from the invoice, not the plan: an extra added in the hour before a
 * renewal can land on the payment after, and the box should carry what its
 * payment actually included.
 */
export function extrasFromInvoice(
  lines: Array<{ amount?: number | null; quantity?: number | null; description?: string | null; metadata?: Record<string, string> | null }>,
  catalogue: CatalogueProduct[],
): OrderLine[] {
  const out: OrderLine[] = []
  for (const line of lines) {
    const m = line.metadata ?? {}
    if (m.chrgd_box_extra !== '1' || !m.chrgd_product_id) continue
    const product = catalogue.find((p) => p.id === m.chrgd_product_id)
    const variant = product?.variants.find((v) => v.id === m.chrgd_variant_id) ?? null
    const quantity = Math.max(1, line.quantity ?? 1)
    out.push({
      sku: m.chrgd_sku || variant?.sku || null,
      productId: m.chrgd_product_id,
      title: product?.title ?? (line.description ?? 'Extra').replace(/^CHRGD — /, '').replace(/, added to your next box$/, ''),
      variantTitle: variant ? [variant.flavour, variant.size].filter(Boolean).join(' · ') || null : null,
      quantity,
      unitPrice: round((line.amount ?? 0) / 100 / quantity),
      supplierCost: variant?.cost ?? product?.cost ?? null,
    })
  }
  return out
}
