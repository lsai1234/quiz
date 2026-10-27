/**
 * Who may be the hero or the bonus, and how well each fits, as the consult
 * decides it (`consultPerson`: the circuit check, the caffeine rules, the
 * pattern keep-outs), judged against the stack it built. Carried to the
 * results page as data (`ConsultExclusions.offerFit`).
 *
 * Its own module so the consult can load it during the charge-up rather than
 * with its first scene (`Analysis`): the offer's selection code is only needed
 * once there are results.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { snapshotPerson, type PersonSnapshot } from '@/lib/offer/select'
import type { EngineResult } from './engine'
import type { FlowState } from './flow'
import { familyOf } from './knowledge'
import { consultPerson } from './offer'

export function offerFitFor(answers: FlowState['answers'], engine: Pick<EngineResult, 'tiers'>, catalogue: readonly CatalogueProduct[]): PersonSnapshot {
  const byId = new Map(catalogue.map((p) => [p.id, p]))
  const stack = engine.tiers.complete.map((id) => byId.get(id)).filter((p): p is CatalogueProduct => Boolean(p))
  return snapshotPerson(consultPerson(answers, stack), catalogue, familyOf)
}
