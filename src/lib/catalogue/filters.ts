import type { CatalogueProduct, CatalogueFilterOptions, StackSlot, DietaryTag, SwapGroup } from './types'
import type { Goal } from '@/lib/types'

export function filterBySlot(products: CatalogueProduct[], slot: StackSlot): CatalogueProduct[] {
  return products.filter((p) => p.stackSlots.includes(slot))
}

/**
 * Anything that can be consumed as a drink (powders mix, RTDs arrive ready).
 * General-purpose helper — NOT the LQD test; LQD is stricter (see below).
 */
export const DRINKABLE_FORMATS = ['powder', 'drink', 'rtd', 'liquid', 'effervescent', 'shot'] as const

export function isDrinkable(product: CatalogueProduct): boolean {
  return (product.formats ?? []).some((f) =>
    (DRINKABLE_FORMATS as readonly string[]).includes(f.toLowerCase()),
  )
}

/**
 * CHRGD LQD eligibility — PRE-MADE drinks only. The package promise is zero
 * prep: grab it, drink it, done. Powders and effervescents need mixing, so
 * they never qualify; only ready-to-drink formats do.
 */
export const RTD_FORMATS = ['rtd', 'drink', 'ready-to-drink', 'liquid', 'shot', 'can', 'bottle'] as const

export function isReadyToDrink(product: CatalogueProduct): boolean {
  return (product.formats ?? []).some((f) =>
    (RTD_FORMATS as readonly string[]).includes(f.toLowerCase()),
  )
}

/** The catalogue restricted to pre-made drinks when LQD mode is on; unchanged otherwise. */
export function lqdOnly(
  products: CatalogueProduct[],
  drinksMode: boolean | undefined,
): CatalogueProduct[] {
  return drinksMode ? products.filter(isReadyToDrink) : products
}

export function filterByGoals(products: CatalogueProduct[], goals: Goal[]): CatalogueProduct[] {
  return products.filter((p) => p.goals.some((g) => goals.includes(g)))
}

export function filterByDietary(products: CatalogueProduct[], tags: DietaryTag[]): CatalogueProduct[] {
  return products.filter((p) => tags.every((t) => p.dietaryTags.includes(t)))
}

export function filterBySwapGroup(products: CatalogueProduct[], swapGroup: SwapGroup): CatalogueProduct[] {
  return products.filter((p) => p.swapGroup === swapGroup)
}

export function filterCatalogue(products: CatalogueProduct[], options: CatalogueFilterOptions): CatalogueProduct[] {
  let result = products

  if (options.slots && options.slots.length > 0) {
    result = result.filter((p) => options.slots!.some((slot) => p.stackSlots.includes(slot)))
  }

  if (options.goals && options.goals.length > 0) {
    result = filterByGoals(result, options.goals)
  }

  if (options.dietary && options.dietary.length > 0) {
    result = filterByDietary(result, options.dietary)
  }

  if (options.swapGroup) {
    result = filterBySwapGroup(result, options.swapGroup)
  }

  if (options.coreOnly) {
    result = getCoreProducts(result)
  }

  if (options.boostersOnly) {
    result = getBoosterProducts(result)
  }

  if (options.stimFree) {
    result = result.filter((p) => !p.hasStimulants)
  }

  return result
}

export function getCoreProducts(products: CatalogueProduct[]): CatalogueProduct[] {
  return products.filter((p) => p.isCoreEligible)
}

export function getBoosterProducts(products: CatalogueProduct[]): CatalogueProduct[] {
  return products.filter((p) => p.isBoosterEligible)
}
