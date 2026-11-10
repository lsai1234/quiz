/**
 * The hero offer and the free gift as a test view shows them (Settings → Test
 * views), so a founder can see both on a sample results page before either is
 * on for customers. Pure; the founders' own settings are never changed.
 *
 *   Hero  The approved heroes when there are any. Otherwise the products a
 *         founder has switched on as a hero in Settings → Offer, with their
 *         checks counted as done for the test view only; and with none of
 *         those, any product on sale. The wording stays a register claim
 *         valid for the product's kind, or none, so nothing is said that
 *         the register doesn't back.
 *   Gift  The founders' pool when it has a product on sale. Otherwise any
 *         product: the selection still keeps every gifted box above the
 *         margin floor, and the minimum, floor and box sizes are the real ones.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { activeBonusPool, activeHeroIds, claimChoicesFor, emptyHeroApproval, type HeroApproval, type OfferSettings } from '@/lib/offer/settings'
import { offerable } from '@/lib/offer/select'

/** Who "checked" a sample hero, as the hub would show it. */
export const SAMPLE_HERO_CHECKER = 'Sample for test views'

const dayBefore = (today: string) => new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

function sampleApproval(product: CatalogueProduct, had: HeroApproval | undefined, today: string): HeroApproval {
  const claims = claimChoicesFor(product.swapGroup)
  const claimId = had?.claimId && claims.some((c) => c.id === had.claimId) ? had.claimId : 'none'
  return {
    ...emptyHeroApproval(product.id),
    hero: true,
    legalGB: true,
    novelFood: 'not-novel',
    safetyReviewed: true,
    safetyNotes: SAMPLE_HERO_CHECKER,
    claimId,
    checkedBy: SAMPLE_HERO_CHECKER,
    // The day before, so a browser a few hours behind still reads it as done.
    checkedAt: dayBefore(today),
  }
}

export function withSampleOffer(settings: OfferSettings, catalogue: readonly CatalogueProduct[], today = new Date().toISOString().slice(0, 10)): OfferSettings {
  let next = settings
  if (settings.heroEnabled && activeHeroIds(settings, catalogue, today).length === 0) {
    const onSale = catalogue.filter(offerable)
    const started = onSale.filter((p) => settings.heroes[p.id]?.hero)
    const heroes = { ...settings.heroes }
    for (const p of started.length ? started : onSale) heroes[p.id] = sampleApproval(p, settings.heroes[p.id], today)
    next = { ...next, heroes }
  }
  if (settings.bonus.enabled && activeBonusPool(settings, catalogue).length === 0) {
    next = { ...next, bonus: { ...next.bonus, pool: catalogue.filter(offerable).map((p) => p.id) } }
  }
  return next
}
