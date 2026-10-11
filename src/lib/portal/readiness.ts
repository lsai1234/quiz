/**
 * Product-readiness checks for the control centre. Each product gets a set of
 * traffic-light checks and an overall status (worst of its checks).
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { isAccessory } from '@/lib/catalogue/accessory'

/**
 * `info` is something worth knowing that nobody can act on — it never makes a
 * product "need attention". Reporting an unfixable gap as a warning taught
 * founders to ignore the warnings, including the ones they could fix.
 */
export type CheckStatus = 'ok' | 'info' | 'warn' | 'fail'

/** Which part of the product page fixes a check. */
export type ReadinessSection = 'listing' | 'variants' | 'quiz' | 'supplier'

export interface ReadinessCheck {
  id: string
  label: string
  status: CheckStatus
  detail?: string
  section?: ReadinessSection
}

export interface ProductReadiness {
  productId: string
  overall: CheckStatus
  checks: ReadinessCheck[]
}

const RANK: Record<CheckStatus, number> = { ok: 0, info: 0, warn: 1, fail: 2 }
function worst(statuses: CheckStatus[]): CheckStatus {
  return statuses.reduce<CheckStatus>((acc, s) => (RANK[s] > RANK[acc] ? s : acc), 'ok')
}

export function productReadiness(p: CatalogueProduct, opts: { live: boolean }): ProductReadiness {
  const config = getPricingConfig()
  const checks: ReadinessCheck[] = []

  // 1. Identity — a real supplier product we can actually order, plus an image.
  // The supplier SKU is what makes it orderable: without one it cannot be
  // dropshipped, however complete the rest of the record looks.
  const realId = p.variants.some((v) => !!v.sku)
  const hasImage = !!p.imageUrl
  checks.push({
    id: 'identity',
    label: 'Real product & image',
    status: realId && hasImage ? 'ok' : realId ? 'warn' : opts.live ? 'fail' : 'warn',
    detail: !realId ? 'No supplier SKU — can’t be ordered' : !hasImage ? 'No image set' : undefined,
    section: !realId ? 'variants' : 'listing',
  })

  // 2. Classification — tagged correctly.
  const missing: string[] = []
  if (p.stackSlots.length === 0) missing.push('stack slot')
  if (p.goals.length === 0) missing.push('goal')
  if (!p.swapGroup || p.swapGroup === 'general') missing.push('swap group')
  if (!p.category) missing.push('category')
  checks.push({
    id: 'classification',
    label: 'Tagged correctly',
    status: missing.length === 0 ? 'ok' : missing.length <= 1 ? 'warn' : 'fail',
    detail: missing.length ? `Missing: ${missing.join(', ')}` : undefined,
    section: missing.length === 1 && missing[0] === 'category' ? 'listing' : 'quiz',
  })

  // 3. Subscription-ready.
  let subStatus: CheckStatus = 'ok'
  let subDetail: string | undefined
  if (!p.subscriptionEligible) {
    // An accessory has no dose and cannot be a monthly plan — that is not
    // something to fix, so it never makes the product "need attention".
    subStatus = isAccessory(p) ? 'info' : 'warn'
    subDetail = isAccessory(p) ? 'One-off only (an accessory)' : 'Not subscription-eligible'
  } else if (!(p.servings > 0)) {
    subStatus = 'fail'
    subDetail = 'No servings set'
  } else {
    const longLasting = p.servings > config.maxSubscriptionServings
    const lastsTooLong = p.servings / 30 > config.maxDeliveryMonths
    if (longLasting && lastsTooLong && !p.subscriptionProductId) {
      subStatus = 'warn'
      subDetail = `${p.servings} servings — map a monthly refill`
    }
  }
  checks.push({ id: 'subscription', label: 'Subscription-ready', status: subStatus, detail: subDetail, section: 'quiz' })

  // 4. Pricing-ready — cost set for accurate margins. Zero is "not known", the
  // same as everywhere else that reads a cost (`costFor`): nothing we sell is
  // free to us, and a 0 passing here hid every product nobody had costed.
  const costed = p.cost != null && p.cost > 0
  checks.push({
    id: 'pricing',
    label: 'Cost set for margins',
    status: costed ? 'ok' : 'warn',
    detail: costed ? undefined : 'What PowerBody charge us is not known, so margins are estimated',
    section: 'supplier',
  })

  // 5. Shippable — weight moves the margin, because PowerBody charge delivery by
  // weight BAND. It is INFORMATION, never a warning or a failure:
  // their API publishes no weight on `getProductList` or `getProductInfo`, so
  // this is supplier information we have no way to fetch, and failing a product
  // for it would fail the entire catalogue for something no one can fix from
  // here. An order with an unknown weight is sent without one and PowerBody
  // weigh the parcel; what we lose is the margin estimate, not the order.
  const hasWeight = p.weightGrams != null && p.weightGrams > 0
  checks.push({
    id: 'shipping',
    label: 'Shipping weight set',
    status: hasWeight ? 'ok' : 'info',
    detail: hasWeight
      ? undefined
      : `No weight from PowerBody — delivery costed at ${config.delivery.defaultProductGrams}g. Add it under Supplier if you know it.`,
    section: 'supplier',
  })

  // 6. Orderable without a search — PowerBody's id known for every SKU. Without
  // it a stock check before sending has to search for the SKU, which is slow
  // and can hold a paid order. Information (it is filled in by a pull), not a
  // warning: every product imported before ids were kept per SKU lacks it.
  const skus = p.variants.filter((v) => v.sku)
  const withoutId = skus.filter((v) => !v.supplierProductId && !(p.variants.length === 1 && p.supplierProductId)).length
  checks.push({
    id: 'supplier-ids',
    label: 'PowerBody ids known',
    status: withoutId === 0 ? 'ok' : 'info',
    detail: withoutId === 0
      ? undefined
      : `${withoutId} of ${skus.length} SKU${skus.length === 1 ? '' : 's'} without a PowerBody id yet — Pull from PowerBody finds them.`,
    section: 'supplier',
  })

  return { productId: p.id, overall: worst(checks.map((c) => c.status)), checks }
}
