/**
 * Exclusions carry into extras (build H9).
 *
 * Whatever the circuit check ruled out stays ruled out after the handoff: the
 * results page's extras and swap lists are drawn through this, so omega-3
 * can't be added back by someone who said they take blood thinners. The same
 * ingredient check the engine used, so the two can never disagree.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { HealthDataConsent, QuizAnswers } from '@/lib/types'
import type { Ingredient } from './circuit'
import { ingredientsOf } from './knowledge'
import type { PersonSnapshot } from '@/lib/offer/select'

export interface ConsultExclusions {
  consultId: string
  excluded: Ingredient[]
  pharmacistNote: boolean
  /**
   * The consult's own decision on every product, for the offer (who may be the
   * hero or the bonus, and how well each fits). Taken where the consult's
   * answers are (`prepareResults`); absent after a reload, when the page falls
   * back to today's top pick and no bonus.
   */
  offerFit?: PersonSnapshot
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

/**
 * What a one-off order from a consult stack sends to `/api/cart` so the order
 * keeps the consult's exclusions (see `Order.safetyConstraints`). Undefined for
 * a quiz stack, or without the circuit check's consent; the server checks the
 * consent again and drops the list without a current one.
 */
export function orderSafetyFor(
  answers: Pick<QuizAnswers, 'consultExcluded' | 'healthDataConsent'> | null | undefined,
): { excluded: Ingredient[]; healthDataConsent: HealthDataConsent } | undefined {
  if (!answers?.consultExcluded?.length || !answers.healthDataConsent?.accepted) return undefined
  return { excluded: [...answers.consultExcluded], healthDataConsent: answers.healthDataConsent }
}

/**
 * Which medicine the pharmacist note is about, worked out from what was kept
 * out rather than from the circuit answers, which never leave the consult.
 *
 * Both prescription rules (blood thinners, other prescriptions) keep out
 * `rx-interaction`; only weight-loss medication keeps out fat burners as a
 * kind (`circuit.ts` FILTERS). So the exclusions already say which note to
 * show, and the payload needs no new health field to say it.
 */
export type PharmacistNoteKind = 'prescription' | 'weight-meds' | 'both'

export function pharmacistNoteFor(excluded: readonly Ingredient[]): PharmacistNoteKind {
  const rx = excluded.includes('rx-interaction')
  const weight = excluded.includes('fat-burner')
  if (rx && weight) return 'both'
  return weight ? 'weight-meds' : 'prescription'
}
