/**
 * An offer with every switch on: heroes approved across very different kinds
 * (fish oil, a stimulant, an adaptogen, a collagen, a magnesium, a protein,
 * creatine) and a bonus pool, so the safety tests have something to refuse.
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { claimChoicesFor, DEFAULT_OFFER, type HeroApproval, type OfferSettings } from '../settings'

export const TODAY = '2026-11-02'

export function approved(productId: string): HeroApproval {
  const product = MOCK_CATALOGUE.find((p) => p.id === productId)!
  const claim = claimChoicesFor(product.swapGroup)[0]?.id ?? 'none'
  return {
    productId,
    hero: true,
    legalGB: true,
    novelFood: 'not-novel',
    safetyReviewed: true,
    safetyNotes: 'Reviewed.',
    claimId: claim,
    checkedBy: 'A Pharmacist',
    checkedAt: '2026-10-20',
    updatedBy: null,
    updatedAt: null,
  }
}

export const HERO_IDS = ['chrgd-omega-3', 'chrgd-pre-workout', 'chrgd-ashwagandha', 'chrgd-collagen', 'chrgd-magnesium', 'chrgd-clear-whey', 'chrgd-creatine']
export const POOL = ['chrgd-vitamin-d3-k2', 'chrgd-vitamin-c-zinc', 'chrgd-electrolytes', 'chrgd-omega-3', 'chrgd-immunity-fizz', 'chrgd-psyllium-fibre']

export function allOn(over: Partial<OfferSettings['bonus']> = {}): OfferSettings {
  return {
    heroEnabled: true,
    heroes: Object.fromEntries(HERO_IDS.map((id) => [id, approved(id)])),
    bonus: { ...DEFAULT_OFFER.bonus, enabled: true, pool: [...POOL], minSubtotal: 40, floorPounds: 1, floorPct: 0.02, ...over },
  }
}
