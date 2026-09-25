'use client'

/**
 * From a finished consult to a loaded results page (builds H6–H8).
 *
 * `prepareResults` is the whole decision, run once: the stack engine over a
 * freshly loaded catalogue, the charge profile, the handoff payload (validated
 * — an invalid one throws rather than reaching the page), and the adapter's
 * blueprint, answers and identity. Pure apart from the clock.
 *
 * `applyToResultsPage` writes that into the quiz store the results page reads,
 * which is what "results data preloads meanwhile" means: by the time the
 * charge-up finishes, the page it opens has everything it needs.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { useQuizStore } from '@/lib/store'
import type { StackBlueprint } from '@/lib/stack-blueprint/types'
import type { QuizAnswers, StackIdentity } from '@/lib/types'
import { identityFor, toBlueprint, toQuizAnswers } from './adapter'
import { runStackEngine, type EngineResult } from './engine'
import { buildHandoff, validateHandoff, type HandoffPayload } from './handoff'
import { chargeProfile } from './profile'
import type { FlowState } from './flow'

export interface ResultsBundle {
  payload: HandoffPayload
  engine: EngineResult
  blueprint: StackBlueprint
  answers: QuizAnswers
  identity: StackIdentity
  catalogue: CatalogueProduct[]
}

export class EmptyStackError extends Error {
  constructor() {
    super('No product in the catalogue fits this consult')
  }
}

export function prepareResults(state: FlowState, catalogue: CatalogueProduct[], now = new Date()): ResultsBundle {
  const engine = runStackEngine(state.answers, catalogue)
  if (engine.tiers.complete.length === 0) throw new EmptyStackError()
  const payload = buildHandoff({
    consultId: state.consultId,
    route: state.answers.route ?? 'deep',
    goals: state.answers.goals,
    profile: chargeProfile(state.answers),
    engine,
    now,
  })
  const checked = validateHandoff(payload)
  if (!checked.ok) throw new Error(`Invalid handoff payload: ${checked.errors.join('; ')}`)
  return {
    payload,
    engine,
    blueprint: toBlueprint(payload, catalogue),
    answers: toQuizAnswers(state.answers),
    identity: identityFor(payload),
    catalogue,
  }
}

/** Load the results page's data into the store it reads. */
export function applyToResultsPage(bundle: ResultsBundle): void {
  const store = useQuizStore.getState()
  store.setAnswers(bundle.answers)
  store.setCatalogueProducts(bundle.catalogue)
  store.setIdentity(bundle.identity)
  store.setStackBlueprint(bundle.blueprint)
  store.setStackLevel('performance')
  store.setAiStackMeta(bundle.payload.reasons, false)
  store.setConsultExclusions({
    consultId: bundle.payload.consult_id,
    excluded: bundle.payload.excluded,
    pharmacistNote: bundle.payload.flags.pharmacist_note,
  })
  store.setStackReady(true)
}
