/**
 * Product-readiness checks for the control centre. Each product gets a set of
 * traffic-light checks and an overall status (worst of its checks).
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'

export type CheckStatus = 'ok' | 'warn' | 'fail'

export interface ReadinessCheck {
  id: string
  label: string
  status: CheckStatus
  detail?: string
}

export interface ProductReadiness {
  productId: string
  overall: CheckStatus
  checks: ReadinessCheck[]
}

const RANK: Record<CheckStatus, number> = { ok: 0, warn: 1, fail: 2 }
function worst(statuses: CheckStatus[]): CheckStatus {
  return statuses.reduce<CheckStatus>((acc, s) => (RANK[s] > RANK[acc] ? s : acc), 'ok')
}

export function productReadiness(p: CatalogueProduct, opts: { live: boolean }): ProductReadiness {
  const config = getPricingConfig()
  const checks: ReadinessCheck[] = []

  // 1. Identity — real Shopify product + image, vs mock placeholder.
  const realId = !!p.shopifyProductId && p.shopifyProductId.startsWith('gid://')
  const hasImage = !!p.imageUrl
  checks.push({
    id: 'identity',
    label: 'Real product & image',
    status: realId && hasImage ? 'ok' : realId ? 'warn' : opts.live ? 'fail' : 'warn',
    detail: !realId ? 'Mock product — no Shopify id' : !hasImage ? 'No image set' : undefined,
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
  })

  // 3. Subscription-ready.
  let subStatus: CheckStatus = 'ok'
  let subDetail: string | undefined
  if (!p.subscriptionEligible) {
    subStatus = 'warn'
    subDetail = 'Not subscription-eligible'
  } else if (!(p.servings > 0)) {
    subStatus = 'fail'
    subDetail = 'No servings set'
  } else {
    const longLasting = p.servings > config.maxSubscriptionServings
    const lastsTooLong = p.servings / 30 > config.maxDeliveryMonths
    if (longLasting && lastsTooLong && !p.subscriptionProductId) {
      subStatus = 'warn'
      subDetail = `${p.servings} servings — map a monthly refill`
    } else if (opts.live && !p.variants.some((v) => v.sellingPlanId)) {
      subStatus = 'warn'
      subDetail = 'No selling plan configured'
    }
  }
  checks.push({ id: 'subscription', label: 'Subscription-ready', status: subStatus, detail: subDetail })

  // 4. Pricing-ready — cost set for accurate margins.
  checks.push({
    id: 'pricing',
    label: 'Cost set for margins',
    status: p.cost != null ? 'ok' : 'warn',
    detail: p.cost == null ? 'Using estimated cost' : undefined,
  })

  // 5. Shippable — weight is load-bearing twice over. PowerBody charge delivery
  // by weight BAND, so without it the margin is a guess; and their `createOrder`
  // call takes a weight, so without it a live order can't be placed correctly.
  // That second reason is why this fails rather than warns once we're live.
  checks.push({
    id: 'shipping',
    label: 'Shipping weight set',
    status: p.weightGrams != null && p.weightGrams > 0 ? 'ok' : opts.live ? 'fail' : 'warn',
    detail:
      p.weightGrams != null && p.weightGrams > 0
        ? undefined
        : `No weight — delivery cost estimated at ${config.delivery.defaultProductGrams}g`,
  })

  return { productId: p.id, overall: worst(checks.map((c) => c.status)), checks }
}
