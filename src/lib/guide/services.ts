/**
 * What the guide says the box comes with: the charge level's unlocked
 * services (`chargeView`), with the hub's switches as they stand when the
 * order is paid.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { chargeView } from '@/lib/offer/levels'
import { levelSubscriptionRate } from '@/lib/stack-blueprint/pricing'

export async function guideServices(plan: 'oneoff' | 'subscription', products: readonly CatalogueProduct[]): Promise<string[]> {
  try {
    const { getOfferSettings } = await import('@/lib/offer/store')
    const settings = await getOfferSettings()
    return chargeView({
      count: products.length,
      plan,
      services: settings.services,
      ratePct: (l) => Math.round(levelSubscriptionRate(l) * 100),
    })
      .services.filter((s) => s.unlocked)
      .map((s) => s.label)
  } catch {
    return []
  }
}

const PARTNER: readonly string[] = ['guarantee']

/** The partner services a paid box qualified for, for the founders to action. */
export async function partnerServices(
  plan: 'oneoff' | 'subscription',
  count: number,
): Promise<'guarantee'[]> {
  try {
    const { getOfferSettings } = await import('@/lib/offer/store')
    const settings = await getOfferSettings()
    return chargeView({ count, plan, services: settings.services, ratePct: () => 0 })
      .services.filter((s) => s.unlocked && PARTNER.includes(s.id))
      .map((s) => s.id as 'guarantee')
  } catch {
    return []
  }
}

