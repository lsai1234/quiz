/**
 * The free bonus at checkout (plan Phase 4): the server half of everything the
 * results page decided. Shared by the one-off checkout (`/api/cart`) and the
 * subscription checkout (`finalizeCheckout`), so both apply the same rules:
 *
 *   1. The claim still stands (`checkBonusClaim`): switched on, in the pool, a
 *      depth that qualifies, in stock, not in the basket, suitable for them,
 *      over the minimum and above the margin floor.
 *   2. A code and the bonus don't combine. A founder code or a partner's
 *      starter always wins (it is the deal the order is about). A partner's
 *      code: whichever is worth more on this order (`codeOrBonus`). The code
 *      worth more refuses the bonus, with nothing charged; the bonus worth more
 *      drops the code's discount and keeps the partner's referral for
 *      attribution.
 *   3. First order only, one per customer: a signed-in customer, or an email we
 *      already have, with an earlier order is refused before payment. A guest
 *      is checked again at the webhook, once Stripe has their email
 *      (`withholdRepeatBonus`).
 *
 * What comes back is the order line: £0.00, its real cost to us, flagged
 * `bonus`, ready to go to PowerBody in the same parcel. Server-only.
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { SafetyConstraints } from '@/lib/recharge/types'
import type { OrderBonus, OrderLine } from '@/lib/orders/types'
import type { PricingConfig } from '@/lib/stack-blueprint/pricing'
import { hasOtherOrder } from '@/lib/orders/repo'
import type { Order } from '@/lib/orders/types'
import { checkBonusClaim, refusalMessage, type BonusClaim, type BonusRefusal } from './server-check'
import { codeOrBonus } from './results'
import { OFFER_COPY } from './copy'
import type { OfferSettings } from './settings'
import { shortNameOf } from '@/lib/catalogue/short-name'

export type CheckoutCode =
  | { kind: 'none' }
  /** A founder code or a partner's starter: the order's own deal. */
  | { kind: 'set-price' }
  /** A partner's code, and what it takes off this order (£). */
  | { kind: 'partner'; code: string; saving: number }

export type ResolvedBonus =
  | {
      ok: true
      product: CatalogueProduct
      variant: CatalogueVariant
      line: OrderLine
      record: OrderBonus
      /** The partner code's discount comes off: the gift was worth more. */
      dropCodeDiscount: boolean
    }
  | { ok: false; reason: BonusRefusal | 'repeat'; message: string }

const REPEAT = 'it’s for a first order only, one per customer'

export function bonusVariantOf(product: CatalogueProduct): CatalogueVariant | null {
  return (
    product.variants.find((v) => v.id === product.defaultVariantId && v.available && v.price > 0) ??
    product.variants.find((v) => v.available && v.price > 0) ??
    null
  )
}

/** The bonus as an order line: £0.00 to the customer, its real cost to us. */
export function bonusOrderLine(product: CatalogueProduct, variant: CatalogueVariant): OrderLine {
  return {
    sku: variant.sku ?? null,
    productId: product.id,
    title: product.title,
    variantTitle: variant.flavour || variant.size || null,
    quantity: 1,
    unitPrice: 0,
    supplierCost: variant.cost ?? product.cost ?? null,
    weightGrams: product.weightGrams ?? null,
    bonus: true,
  }
}

export async function resolveCheckoutBonus(input: {
  claim: unknown
  settings: OfferSettings
  catalogue: readonly CatalogueProduct[]
  lines: readonly { product: CatalogueProduct; price: number; cost: number | null; quantity: number }[]
  constraints: SafetyConstraints
  isStack: boolean
  code: CheckoutCode
  /** Who is buying, as far as we know before payment. */
  customer: { userId?: string | null; email?: string | null }
  atCheckout: boolean
  config?: PricingConfig
}): Promise<ResolvedBonus> {
  const check = checkBonusClaim({
    claim: input.claim,
    settings: input.settings,
    catalogue: input.catalogue,
    lines: input.lines,
    constraints: input.constraints,
    isStack: input.isStack,
    codeApplied: input.code.kind === 'set-price' || (input.code.kind === 'partner' && input.code.saving > 0.005),
    atCheckout: input.atCheckout,
    config: input.config,
  })
  if (!check.ok) return check
  const { product } = check
  const title = shortNameOf(product)
  const worth = check.item.price

  let dropCodeDiscount = false
  if (input.code.kind === 'set-price') return { ok: false, reason: 'code', message: refusalMessage(title, 'code') }
  if (input.code.kind === 'partner' && input.code.saving > 0.005) {
    if (codeOrBonus(input.settings.bonus.codes, input.code.saving, worth) === 'code') {
      return { ok: false, reason: 'code', message: `${OFFER_COPY.codeBeatsBonus(title)} Nothing has been charged — check your order and try again.` }
    }
    dropCodeDiscount = true
  }

  if (input.settings.bonus.firstOrderOnly && (await hasOtherOrder(input.customer))) {
    return { ok: false, reason: 'repeat', message: `The free ${title} can’t come with this order: ${REPEAT}. Nothing has been charged — check your order and try again.` }
  }

  const variant = bonusVariantOf(product)
  if (!variant) return { ok: false, reason: 'stock', message: refusalMessage(title, 'stock') }
  const level = ((input.claim ?? {}) as Partial<BonusClaim>).level ?? 'complete'
  return {
    ok: true,
    product,
    variant,
    line: bonusOrderLine(product, variant),
    record: {
      productId: product.id,
      title: product.title,
      worth,
      level,
      status: 'included',
      codeNotApplied: dropCodeDiscount && input.code.kind === 'partner' ? input.code.code : null,
    },
    dropCodeDiscount,
  }
}

/**
 * Whether a paid order's bonus has to come off: first order only, and the
 * email Stripe has just given us (a guest's, typically) already has an order.
 * Asked by `markOrderPaid` before the confirmation and the supplier hear about
 * the order, so the gift never ships to a repeat customer.
 *
 * An earlier order to the same address alone doesn't count: households share
 * addresses, so the gift is honoured there.
 */
export async function bonusIsRepeat(order: Pick<Order, 'id' | 'bonus' | 'email' | 'userId'>, email: string | null | undefined): Promise<boolean> {
  if (!order.bonus || order.bonus.status !== 'included') return false
  const { getOfferSettings } = await import('./store')
  if (!(await getOfferSettings()).bonus.firstOrderOnly) return false
  return hasOtherOrder({ userId: order.userId, email: order.email ?? email ?? null }, order.id)
}
