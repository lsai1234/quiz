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
import { stackNameFor } from '@/lib/stack-blueprint/factory'
import type { QuizAnswers, StackIdentity } from '@/lib/types'
import { identityFor, toBlueprint, toQuizAnswers } from './adapter'
import { runStackEngine, type EngineResult } from './engine'
import { buildHandoff, loadHandoffLocally, validateHandoff, type HandoffPayload } from './handoff'
import type { ConsultExclusions } from './exclusions'
import { resultsOpenFor } from './results-tab'
import { chargeProfile } from './profile'
import type { FlowState } from './flow'
import type { PersonSnapshot } from '@/lib/offer/select'

export interface ResultsBundle {
  payload: HandoffPayload
  engine: EngineResult
  blueprint: StackBlueprint
  answers: QuizAnswers
  identity: StackIdentity
  catalogue: CatalogueProduct[]
  /**
   * The consult's decision on every product, for the offer
   * (`ConsultExclusions.offerFit`), when the caller worked it out
   * (`offerFitFor`, passed in so it can be loaded lazily).
   */
  offerFit?: PersonSnapshot
}

type OfferFitFor = (answers: FlowState['answers'], engine: Pick<EngineResult, 'tiers'>, catalogue: readonly CatalogueProduct[]) => PersonSnapshot

export class EmptyStackError extends Error {
  constructor() {
    super('No product in the catalogue fits this consult')
  }
}

export function prepareResults(state: FlowState, catalogue: CatalogueProduct[], now = new Date(), offerFitFor?: OfferFitFor): ResultsBundle {
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
  const answers = toQuizAnswers(state.answers, payload.excluded)
  return {
    payload,
    engine,
    // One name for the stack everywhere: the quiz's rule-based name, not the
    // consult identity's ("Lean Line", "Night Shift"), which named an effect.
    blueprint: { ...toBlueprint(payload, catalogue), stackName: stackNameFor(answers) },
    answers,
    identity: identityFor(payload),
    catalogue,
    offerFit: offerFitFor?.(state.answers, engine, catalogue),
  }
}

/** What the results page draws its extras through, and whether it shows the pharmacist note. */
export function exclusionsOf(payload: HandoffPayload): ConsultExclusions {
  return { consultId: payload.consult_id, excluded: [...payload.excluded], pharmacistNote: payload.flags.pharmacist_note }
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
  store.setConsultExclusions({ ...exclusionsOf(bundle.payload), offerFit: bundle.offerFit })
  store.setStackReady(true)
}

/* ── Surviving a reload ─────────────────────────────────────────────────── */

/**
 * The saved handoff to rebuild the results page from after a hard reload, or
 * null. The store keeps the answers through a reload but not the blueprint or
 * the exclusions (`partialize`), and a consult stack is not something the
 * quiz's rules can rebuild from answers. The handoff copy on the device
 * (`chrgd-consult-handoff`) is the consult's own record of that stack, its
 * exclusions and the pharmacist note, so it is what the page reads back.
 *
 * Only for the consult this tab handed off, and only while the answers in the
 * store are that consult's: a quiz taken since must never be shown a consult's
 * stack, or a consult's note.
 */
export function handoffToRestore(): HandoffPayload | null {
  const marked = resultsOpenFor()
  if (!marked) return null
  if (useQuizStore.getState().answers.answerSource !== 'consult') return null
  const payload = loadHandoffLocally()
  return payload && payload.consult_id === marked ? payload : null
}

/**
 * Rebuild the results page from a saved handoff: the consult's own stack,
 * reasons, exclusions and pharmacist note, against a freshly loaded catalogue.
 * The answers are the ones the store already holds — `toQuizAnswers` wrote
 * them, and they persist.
 */
export function restoreResultsPage(payload: HandoffPayload, catalogue: CatalogueProduct[]): void {
  const store = useQuizStore.getState()
  const answers = store.answers
  store.setCatalogueProducts(catalogue)
  store.setIdentity(identityFor(payload))
  store.setStackBlueprint({ ...toBlueprint(payload, catalogue), stackName: stackNameFor(answers) })
  store.setStackLevel('performance')
  store.setAiStackMeta(payload.reasons, false)
  store.setConsultExclusions(exclusionsOf(payload))
  store.setStackReady(true)
}
