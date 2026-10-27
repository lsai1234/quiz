/**
 * What the results page may know of the offer settings (plan Phase 4): the
 * heroes that take effect, and the bonus as customers may see it. Read through
 * `GET /api/offer`, public, so it carries nothing but what the page needs.
 *
 *   Heroes  Only approvals with every check complete, against the live
 *           catalogue. Who checked, their notes and the audit stamps stay in
 *           the hub; the page gets the product, its novel-food status and the
 *           wording it may carry, and re-runs the same checks on what it gets.
 *   Bonus   Off unless the hub has switched it on AND the checkout can put it
 *           on the order (`BONUS_AT_CHECKOUT`). Until the Stripe line and the
 *           PowerBody line are built (`docs/offer-phase4-proposals.md`), a gift
 *           shown here would be a gift promised and not sent, so the switch in
 *           the hub cannot reach a customer yet. `OFFER_BONUS_PREVIEW=1` shows
 *           it on a preview server for review; the checkout still refuses it
 *           there (`bonusAtCheckout`), so a preview can never take an order
 *           that promises one.
 *
 * Server-only.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { activeBonusPool, activeHeroIds, type HeroApproval, type OfferSettings } from './settings'

/**
 * Whether the checkout puts the bonus on the order: the £0 Stripe line, the
 * PowerBody line and the cost on the order. False until those are approved
 * and built (Phase 4, items 4 and 5).
 */
export const BONUS_AT_CHECKOUT = false

/** The checkout honours a bonus claim. Never in preview. */
export function bonusAtCheckout(): boolean {
  return BONUS_AT_CHECKOUT
}

/** Customers are shown the bonus: the checkout honours it, or this is a preview server. */
export function bonusShown(env: Record<string, string | undefined> = process.env): boolean {
  return BONUS_AT_CHECKOUT || env.OFFER_BONUS_PREVIEW === '1'
}

function publicApproval(a: HeroApproval): HeroApproval {
  return {
    productId: a.productId,
    hero: true,
    legalGB: true,
    novelFood: a.novelFood,
    safetyReviewed: true,
    safetyNotes: '',
    claimId: a.claimId,
    // The checks were done; by whom is the hub's business.
    checkedBy: 'checked',
    checkedAt: a.checkedAt,
    updatedBy: null,
    updatedAt: null,
  }
}

export function publicOffer(
  settings: OfferSettings,
  catalogue: readonly Pick<CatalogueProduct, 'id' | 'swapGroup'>[],
  opts: { today?: string; bonusShown?: boolean } = {},
): OfferSettings {
  const heroes: Record<string, HeroApproval> = {}
  for (const id of activeHeroIds(settings, catalogue, opts.today)) heroes[id] = publicApproval(settings.heroes[id])
  const shown = opts.bonusShown ?? bonusShown()
  const pool = shown ? activeBonusPool(settings, catalogue) : []
  return {
    heroEnabled: settings.heroEnabled && Object.keys(heroes).length > 0,
    heroes,
    bonus: { ...settings.bonus, enabled: shown && settings.bonus.enabled && pool.length > 0, pool },
  }
}
