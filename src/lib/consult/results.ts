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
import { buildRead, type ConsultRead } from './read'

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
  /** "Your read" (Phase 5): shown on Fully charged and at the top of the results page. */
  read: ConsultRead
}

type OfferFitFor = (answers: FlowState['answers'], engine: Pick<EngineResult, 'tiers'>, catalogue: readonly CatalogueProduct[]) => PersonSnapshot

export class EmptyStackError extends Error {
  constructor() {
    super('No product in the catalogue fits this consult')
  }
}

export function prepareResults(
  state: FlowState,
  catalogue: CatalogueProduct[],
  now = new Date(),
  offerFitFor?: OfferFitFor,
  /** Amp's "found" line, when the AI wrote one during the round (the client knows it). */
  found: string | null = null,
): ResultsBundle {
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
  const read = buildRead({ consultId: state.consultId, answers: state.answers, engine, found })
  return {
    payload,
    engine,
    // One name for the stack everywhere: the top pinpointed pattern ("Wired
    // and tired"), else the quiz's rule-based name; never the consult
    // identity's ("Lean Line", "Night Shift"), which named an effect.
    blueprint: { ...toBlueprint(payload, catalogue), stackName: read.identity ?? stackNameFor(answers) },
    read,
    answers,
    identity: identityFor(payload),
    catalogue,
    offerFit: offerFitFor?.(state.answers, engine, catalogue),
  }
}

/** What the results page draws its extras through, whether it shows the pharmacist note, and the consult's own tiers. */
export function exclusionsOf(payload: HandoffPayload): ConsultExclusions {
  return {
    consultId: payload.consult_id,
    excluded: [...payload.excluded],
    pharmacistNote: payload.flags.pharmacist_note,
    tiers: { essentials: [...payload.tiers.essentials], standard: [...payload.tiers.standard], complete: [...payload.tiers.complete] },
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
  store.setConsultExclusions({ ...exclusionsOf(bundle.payload), offerFit: bundle.offerFit, read: bundle.read })
  store.setStackReady(true)
  if (bundle.offerFit) saveOfferFit(bundle.payload.consult_id, bundle.offerFit)
  saveRead(bundle.read)
}

/* ── The read, for this tab ─────────────────────────────────────────────── */

const READ_KEY = 'chrgd-consult-read'

/** "Your read", kept for this tab so a reload shows it again. On the device only, gone when the tab closes. */
function saveRead(read: ConsultRead): void {
  try {
    window.sessionStorage.setItem(READ_KEY, JSON.stringify(read))
  } catch {
    /* No storage: after a reload the page shows the stack without the read. */
  }
}

export function loadRead(consultId: string): ConsultRead | undefined {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(READ_KEY) ?? 'null') as ConsultRead | null
    return raw?.consultId === consultId ? raw : undefined
  } catch {
    return undefined
  }
}

/* ── The offer's fit, for this tab ─────────────────────────────────────── */

/**
 * The consult's offer fit (`ConsultExclusions.offerFit`), kept for this tab so
 * a hard reload still shows the same hero and gift. `sessionStorage`, like the
 * results-tab marker: gone when the tab closes. Only whether each product is
 * kept out, never why (the why can name a medicine), with its fit and kind.
 */
const OFFER_FIT_KEY = 'chrgd-consult-offer-fit'

function saveOfferFit(consultId: string, fit: PersonSnapshot): void {
  try {
    const slim: PersonSnapshot = {}
    for (const [id, f] of Object.entries(fit)) slim[id] = { out: f.out ? 'kept out' : null, fit: f.fit, kind: f.kind }
    window.sessionStorage.setItem(OFFER_FIT_KEY, JSON.stringify({ consultId, fit: slim }))
  } catch {
    /* No storage: after a reload the page falls back to the top pick. */
  }
}

export function loadOfferFit(consultId: string): PersonSnapshot | undefined {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(OFFER_FIT_KEY) ?? 'null') as { consultId?: string; fit?: PersonSnapshot } | null
    return raw?.consultId === consultId && raw.fit && typeof raw.fit === 'object' ? raw.fit : undefined
  } catch {
    return undefined
  }
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
  const read = loadRead(payload.consult_id)
  store.setStackBlueprint({ ...toBlueprint(payload, catalogue), stackName: read?.identity ?? stackNameFor(answers) })
  store.setStackLevel('performance')
  store.setAiStackMeta(payload.reasons, false)
  store.setConsultExclusions({ ...exclusionsOf(payload), offerFit: loadOfferFit(payload.consult_id), read })
  store.setStackReady(true)
}
