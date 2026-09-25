/**
 * Exclusions carry into extras (build H9).
 *
 * Whatever the circuit check ruled out stays ruled out after the handoff: the
 * results page's extras and swap lists are drawn through this, so omega-3
 * can't be added back by someone who said they take blood thinners. The same
 * ingredient check the engine used, so the two can never disagree.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { Ingredient } from './circuit'
import { ingredientsOf } from './knowledge'

export interface ConsultExclusions {
  consultId: string
  excluded: Ingredient[]
  pharmacistNote: boolean
}

export function isExcluded(product: Pick<CatalogueProduct, 'swapGroup' | 'title' | 'contraindications'>, excluded: readonly Ingredient[]): boolean {
  if (excluded.length === 0) return false
  const has = ingredientsOf(product)
  return excluded.some((i) => has.has(i))
}

export function withoutExcluded<T extends Pick<CatalogueProduct, 'swapGroup' | 'title' | 'contraindications'>>(
  products: T[],
  exclusions: ConsultExclusions | null | undefined,
): T[] {
  if (!exclusions || exclusions.excluded.length === 0) return products
  return products.filter((p) => !isExcluded(p, exclusions.excluded))
}
