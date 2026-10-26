/**
 * What the Offer screen and a product's Hero section are shown: the settings,
 * every product with a hero record and where it stands, and the bonus
 * economics worked out against the live catalogue. Server-only (it reads the
 * catalogue), but no I/O of its own beyond that.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import {
  activeBonusPool,
  activeHeroIds,
  claimChoicesFor,
  emptyHeroApproval,
  heroStatus,
  missingHeroChecks,
  type HeroApproval,
  type HeroCheck,
  type HeroStatus,
  type OfferSettings,
} from './settings'
import {
  bonusEconomics,
  costedItem,
  costsIncludeVat,
  exampleStacks,
  stackMargin,
  type BonusEconomicsRow,
  type BonusProposal,
  type CostedItem,
  type StackMargin,
  proposeBonusDefaults,
} from './bonus-economics'
import type { StackLevel } from '@/lib/types'

export interface HeroRow {
  productId: string
  title: string
  swapGroup: string | null
  inCatalogue: boolean
  status: HeroStatus
  missing: HeroCheck[]
  approval: HeroApproval
}

export interface ProductOption {
  id: string
  title: string
  category: string
  swapGroup: string
  stackSlot: string | null
}

export interface OfferView {
  settings: OfferSettings
  /** What Phase 3's selection would read today. Empty while a switch is off. */
  active: { heroes: string[]; bonusPool: string[] }
  heroes: HeroRow[]
  economics: {
    costsIncludeVat: boolean
    stacks: { level: StackLevel; name: string; items: CostedItem[]; estimated: boolean; margin: StackMargin }[]
    rows: BonusEconomicsRow[]
    proposal: BonusProposal | null
    /** Pool ids no longer in the catalogue (removed, or never imported). */
    missingFromCatalogue: string[]
  }
  products: ProductOption[]
}

const optionOf = (p: CatalogueProduct): ProductOption => ({
  id: p.id,
  title: p.title,
  category: p.category,
  swapGroup: p.swapGroup,
  stackSlot: p.stackSlots[0] ?? null,
})

export function heroRow(productId: string, approval: HeroApproval | undefined, product: CatalogueProduct | undefined): HeroRow {
  const a = approval ?? emptyHeroApproval(productId)
  return {
    productId,
    title: product?.title ?? productId,
    swapGroup: product?.swapGroup ?? null,
    inCatalogue: Boolean(product),
    status: heroStatus(a, product),
    missing: a.hero ? missingHeroChecks(a, product) : [],
    approval: a,
  }
}

export function offerView(settings: OfferSettings, catalogue: CatalogueProduct[]): OfferView {
  const config = getPricingConfig()
  const byId = new Map(catalogue.map((p) => [p.id, p]))
  const heroes = Object.values(settings.heroes)
    // Only products someone has started on: a record with nothing in it is noise.
    .filter((a) => a.hero || a.legalGB || a.safetyReviewed || a.claimId !== null || a.checkedBy || a.checkedAt)
    .map((a) => heroRow(a.productId, a, byId.get(a.productId)))
    .sort((x, y) => ['approved', 'incomplete', 'off'].indexOf(x.status) - ['approved', 'incomplete', 'off'].indexOf(y.status) || x.title.localeCompare(y.title))
  const stacks = exampleStacks(catalogue)
  const pool = settings.bonus.pool.map((id) => byId.get(id)).filter((p): p is CatalogueProduct => Boolean(p))
  const items = pool.map(costedItem).filter((i): i is CostedItem => i !== null)
  return {
    settings,
    active: { heroes: activeHeroIds(settings, catalogue), bonusPool: activeBonusPool(settings, catalogue) },
    heroes,
    economics: {
      costsIncludeVat: costsIncludeVat(config),
      stacks: stacks.map((s) => ({ ...s, margin: stackMargin(s.items, null, config) })),
      rows: bonusEconomics(items, stacks, settings.bonus, config),
      proposal: proposeBonusDefaults(items, stacks, config),
      missingFromCatalogue: settings.bonus.pool.filter((id) => !byId.has(id)),
    },
    products: catalogue.map(optionOf).sort((a, b) => a.title.localeCompare(b.title)),
  }
}

export interface HeroView {
  row: HeroRow
  claimChoices: { id: string; wording: string }[]
  heroEnabled: boolean
}

export function heroView(settings: OfferSettings, productId: string, product: CatalogueProduct | undefined): HeroView {
  return {
    row: heroRow(productId, settings.heroes[productId], product),
    claimChoices: claimChoicesFor(product?.swapGroup),
    heroEnabled: settings.heroEnabled,
  }
}
