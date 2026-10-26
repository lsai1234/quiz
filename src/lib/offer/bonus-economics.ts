/**
 * What a free bonus costs us, on stacks people actually buy (plan Phase 2, 3).
 *
 * For each product in the pool: its shelf price, what PowerBody charge us for
 * it (VAT included when we pay it — the same switch the rest of the margin
 * maths reads), and what three example stacks keep with and without it. The
 * stacks are drawn from the live catalogue the way a tier is sized: one per
 * kind, in stock, costed, highest recommendation priority first, three, five
 * and seven products — Essentials, Balanced and Complete.
 *
 * The margin is the same waterfall the rest of the business runs on
 * (`unitEconomics`, as `contributionOf` uses it for a whole order): the stack's
 * revenue after its bundle tier and the delivery it is charged, less goods, the
 * whole parcel's PowerBody delivery, card fees and the returns provision. The
 * bonus adds its cost and its weight to the parcel and nothing to the revenue —
 * it is free, and "free" never moves the stack's price or delivery.
 *
 * Pure and client-safe.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { masterVariant } from '@/lib/catalogue/master'
import { getPricingConfig, priceOneOffLines, unitCostOf, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { customerDeliveryCharge } from '@/lib/pricing/delivery'
import { unitEconomics } from '@/lib/pricing/unit-economics'
import { costFromSupplierPrice, supplierVatIsCost } from '@/lib/pricing/vat'
import type { StackLevel } from '@/lib/types'
import type { BonusSettings } from './settings'

const round = (n: number) => Math.round(n * 100) / 100

export const LEVEL_NAME: Record<StackLevel, string> = { essentials: 'Essentials', performance: 'Balanced', complete: 'Complete' }
const SIZES: Record<StackLevel, number> = { essentials: 3, performance: 5, complete: 7 }

export interface CostedItem {
  id: string
  title: string
  /** Shelf price of the variant sold (£ inc VAT). */
  price: number
  /** PowerBody's price (£ ex VAT), or null when not on file. */
  supplierCost: number | null
  grams: number | null
}

export function costedItem(p: CatalogueProduct): CostedItem | null {
  const v = masterVariant(p)
  if (!v || !(v.price > 0)) return null
  const cost = (v as { cost?: number | null }).cost ?? p.cost ?? null
  return { id: p.id, title: p.shortName || p.title, price: v.price, supplierCost: cost != null && cost > 0 ? cost : null, grams: p.weightGrams ?? null }
}

export interface ExampleStack {
  level: StackLevel
  name: string
  items: CostedItem[]
  /** Some item has no PowerBody cost on file: its cost is the site-wide estimate, so the margins are too. */
  estimated: boolean
}

/**
 * Three stacks to test the bonus against: in stock, highest recommendation
 * priority first, one per stack slot and then one per kind — costed products
 * first, and estimated ones only to make up the numbers when too few have a
 * cost on file.
 */
export function exampleStacks(catalogue: readonly CatalogueProduct[]): ExampleStack[] {
  const eligible = catalogue
    .filter((p) => !p.isSubscriptionOnly && p.variants.some((v) => v.available))
    .map((p) => ({ p, item: costedItem(p) }))
    .filter((x): x is { p: CatalogueProduct; item: CostedItem } => x.item !== null)
    .sort(
      (a, b) =>
        Number(b.item.supplierCost !== null) - Number(a.item.supplierCost !== null) ||
        (b.p.recommendationPriority ?? 0) - (a.p.recommendationPriority ?? 0) ||
        a.item.title.localeCompare(b.item.title),
    )
  // One per stack slot first (protein, performance, health…), the way a tier
  // is spread across a person's needs; then one per kind to make up seven.
  // By kind alone, the top seven were four proteins.
  const picked: CostedItem[] = []
  const kinds = new Set<string>()
  for (const keyOf of [(p: CatalogueProduct) => p.stackSlots[0] ?? p.swapGroup, (p: CatalogueProduct) => p.swapGroup ?? p.id]) {
    const used = new Set<string>()
    for (const { p, item } of eligible) {
      if (picked.length === SIZES.complete) break
      const key = keyOf(p) ?? p.id
      if (used.has(key) || kinds.has(p.swapGroup ?? p.id) || picked.some((i) => i.id === item.id)) continue
      used.add(key)
      kinds.add(p.swapGroup ?? p.id)
      picked.push(item)
    }
  }
  return (Object.keys(SIZES) as StackLevel[])
    .filter((level) => picked.length >= SIZES[level])
    .map((level) => {
      const items = picked.slice(0, SIZES[level])
      return { level, name: LEVEL_NAME[level], items, estimated: items.some((i) => i.supplierCost === null) }
    })
}

export interface StackMargin {
  /** Undiscounted subtotal, what the minimum is measured against (£). */
  subtotal: number
  /** What the customer pays for the goods, after the bundle tier (£). */
  total: number
  /** Mainland delivery charged on it (£). */
  delivery: number
  netRevenue: number
  contribution: number
  marginPct: number
}

/** What a stack keeps after every cost, with an optional free extra in the parcel. */
export function stackMargin(items: readonly CostedItem[], extra: CostedItem | null = null, config: PricingConfig = getPricingConfig()): StackMargin {
  const priced = priceOneOffLines(
    items.map((i) => ({ price: i.price, cost: i.supplierCost ?? unitCostOf({ basePrice: i.price }, i.price, config), quantity: 1 })),
    config,
  )
  const delivery = customerDeliveryCharge(priced.subtotal, 'uk-1', config)
  const parcel = extra ? [...items, extra] : [...items]
  const known = parcel.every((i) => i.supplierCost !== null)
  const cost = parcel.reduce((s, i) => s + (i.supplierCost ?? unitCostOf({ basePrice: i.price }, i.price, config)), 0)
  const grams = parcel.reduce((s, i) => s + (i.grams ?? 0), 0)
  const econ = unitEconomics(
    {
      shelfPrice: priced.total,
      supplierCost: known || cost > 0 ? round(cost) : null,
      grams: grams > 0 ? grams : null,
      customerDelivery: delivery,
      // One parcel, all of it: see `contributionOf` for why this must be 1.
      sharedParcelItems: 1,
    },
    config,
  )
  return {
    subtotal: round(priced.subtotal),
    total: round(priced.total),
    delivery,
    netRevenue: econ.netRevenue,
    contribution: econ.contribution,
    marginPct: econ.marginPct,
  }
}

/** The floor an order must clear with the bonus in it: the larger of the pound and percentage floors. */
export function bonusFloor(netRevenue: number, settings: Pick<BonusSettings, 'floorPounds' | 'floorPct'>): number {
  return round(Math.max(settings.floorPounds, settings.floorPct * netRevenue))
}

export interface BonusOnStack {
  level: StackLevel
  without: StackMargin
  with: StackMargin
  /** What the bonus took off what we keep (£). */
  cost: number
  /** Subtotal at or over the minimum. */
  meetsMinimum: boolean
  /** With the bonus in, the order still clears the floor. */
  clearsFloor: boolean
  /** Both, and the tier qualifies: the bonus would be offered on this stack. */
  qualifies: boolean
}

export interface BonusEconomicsRow {
  item: CostedItem
  /** What it costs us (£): PowerBody's price, VAT included when we pay it. */
  costToUs: number | null
  stacks: BonusOnStack[]
}

export function bonusEconomics(
  pool: readonly CostedItem[],
  stacks: readonly ExampleStack[],
  settings: BonusSettings,
  config: PricingConfig = getPricingConfig(),
): BonusEconomicsRow[] {
  const base = new Map(stacks.map((s) => [s.level, stackMargin(s.items, null, config)]))
  return pool.map((item) => ({
    item,
    costToUs: item.supplierCost !== null ? costFromSupplierPrice(item.supplierCost, config) : null,
    stacks: stacks.map((s) => {
      const without = base.get(s.level)!
      // A bonus already in the stack would be a duplicate, never offered; shown at its cost anyway.
      const withIt = stackMargin(s.items, item, config)
      const meetsMinimum = without.subtotal >= settings.minSubtotal
      const clearsFloor = withIt.contribution >= bonusFloor(withIt.netRevenue, settings)
      return {
        level: s.level,
        without,
        with: withIt,
        cost: round(without.contribution - withIt.contribution),
        meetsMinimum,
        clearsFloor,
        qualifies: meetsMinimum && clearsFloor && settings.tiers.includes(s.level) && !s.items.some((i) => i.id === item.id),
      }
    }),
  }))
}

export interface BonusProposal {
  minSubtotal: number
  floorPounds: number
  floorPct: number
  /** The working, in a sentence, for the screen. */
  why: string
}

/**
 * Proposed defaults, from these numbers, on one rule: **the bonus may cost at
 * most half of what the smallest qualifying stack keeps.**
 *
 * - Floor: half of what the smallest example stack keeps without a bonus, in
 *   pounds (rounded down to £1) and as a share of its net revenue (rounded down
 *   to 5%).
 * - Minimum: the smallest example stack's subtotal (rounded up to £5) on which
 *   the dearest product in the pool still clears that floor.
 *
 * Null with an empty pool or no costed stacks: nothing to work from.
 */
export function proposeBonusDefaults(
  pool: readonly CostedItem[],
  stacks: readonly ExampleStack[],
  config: PricingConfig = getPricingConfig(),
): BonusProposal | null {
  if (pool.length === 0 || stacks.length === 0) return null
  const smallest = stackMargin(stacks[0].items, null, config)
  const floorPounds = Math.max(0, Math.floor(smallest.contribution / 2))
  const floorPct = Math.max(0, Math.floor((smallest.marginPct / 2) * 20) / 20)
  const dearest = [...pool].sort((a, b) => (b.supplierCost ?? b.price) - (a.supplierCost ?? a.price))[0]
  const floor = { floorPounds, floorPct }
  const fits = stacks.find((s) => {
    const m = stackMargin(s.items, dearest, config)
    return m.contribution >= bonusFloor(m.netRevenue, floor)
  })
  const minSubtotal = fits
    ? Math.ceil(stackMargin(fits.items, null, config).subtotal / 5) * 5
    : Math.ceil(stackMargin(stacks[stacks.length - 1].items, null, config).subtotal / 5) * 5
  return {
    minSubtotal,
    floorPounds,
    floorPct,
    why:
      `${LEVEL_NAME[stacks[0].level]} keeps £${smallest.contribution.toFixed(2)} (${Math.round(smallest.marginPct * 100)}%) without a bonus, so the floor is half of that. ` +
      (fits
        ? `${dearest.title}, the dearest in the pool, still clears it from ${LEVEL_NAME[fits.level]} at £${minSubtotal} and up.`
        : `${dearest.title}, the dearest in the pool, clears it on none of the example stacks: take it out, or lower the floor.`),
  }
}

/** Whether the costs above include PowerBody's VAT (they do when we pay it). For the screen's label. */
export function costsIncludeVat(config: PricingConfig = getPricingConfig()): boolean {
  return supplierVatIsCost(config)
}
