/**
 * Trace it back (Amp Consult and offer plan, Phase 8): for each product the
 * consult picked, the path back from the product to the answers that put it
 * there, worked out from the engine's own scoring.
 *
 *   product  →  steps  →  answers
 *
 * A product scores by the needs it meets (`kindOf(product).meets`), and each
 * need by its sources: a goal, a pattern Pinpoint confirmed, or an answer
 * (`engine.needs`). A step is named only where the claims maps back it for
 * this product (the goal, the pattern or the need), and its approved claim
 * goes with it, verbatim. Anything else collapses into "From your answers".
 *
 * Their answers are restated as they gave them; a goal line ("Energy is your
 * top goal") is never put beside a product its map doesn't back, since that
 * would say the product is for it. Weights are how much each counted, 0–1.
 *
 * Kept in this tab only (`saveTraces`), never in the handoff saved to the
 * server: the trail includes things like what Pinpoint confirmed.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import { goalClaimFor } from '@/lib/results/goal-claims'
import { needClaimFor, patternClaimFor } from '@/lib/results/consult-claims'
import { GOAL_TO_QUIZ } from './adapter'
import type { EngineResult, ReasonOrigin } from './engine'
import { kindOf, type NeedId } from './knowledge'
import { leads } from './pinpoint/leads'
import { hunchEvidence } from './pinpoint/playback'
import { PATTERN_BY_ID } from './pinpoint/library'
import { GOAL_LABEL } from './summary'
import { TRACE_COPY, NEED_LABEL } from './trace-copy'
import type { ConsultAnswers } from './types'

export interface TraceAnswer {
  text: string
  /** How much it counted, 0–1 against the heaviest answer for this product. */
  weight: number
}

export interface TraceStep {
  kind: 'pattern' | 'goal' | 'need' | 'answers'
  /** Its name, where the claims map backs it; "From your answers" otherwise. */
  label: string
  /** The approved claim that lets it be named, verbatim; null for "From your answers". */
  claim: string | null
  /** How much it counted, 0–1 against the heaviest step for this product. */
  weight: number
  answers: TraceAnswer[]
}

export interface Trace {
  productId: string
  steps: TraceStep[]
}

/** At most this many steps, and answers under each. */
export const MAX_STEPS = 4
export const MAX_ANSWERS = 4

interface Raw {
  kind: TraceStep['kind']
  label: string
  claim: string | null
  weight: number
  answers: Map<string, number>
}

export function traceFor(product: CatalogueProduct, answers: ConsultAnswers, engine: Pick<EngineResult, 'needs'>): Trace | null {
  const kind = kindOf(product)
  if (!kind) return null
  const steps = new Map<string, Raw>()
  const evidence = new Map(leads(answers).map((l) => [l.pattern.id, hunchEvidence(l)]))
  const step = (key: string, make: () => Omit<Raw, 'weight' | 'answers'>) => {
    if (!steps.has(key)) steps.set(key, { ...make(), weight: 0, answers: new Map() })
    return steps.get(key)!
  }
  const collapsed = () => step('answers', () => ({ kind: 'answers', label: TRACE_COPY.fromYourAnswers, claim: null }))
  const add = (s: Raw, w: number, lines: string[]) => {
    s.weight += w
    for (const line of lines) s.answers.set(line, (s.answers.get(line) ?? 0) + w / Math.max(1, lines.length))
  }

  for (const [need, affinity] of Object.entries(kind.meets) as [NeedId, number][]) {
    const score = engine.needs[need]
    if (!affinity || !score?.total) continue
    for (const source of score.sources) {
      const w = affinity * source.weight
      if (w <= 0) continue
      const origin: ReasonOrigin = source.origin ?? { kind: 'answer' }
      if (origin.kind === 'pattern') {
        const claim = patternClaimFor(origin.pattern, product)
        const lines = evidence.get(origin.pattern) ?? []
        // Unnamed, its evidence would only repeat the answers already under "From your answers", worded differently: it counts, unlisted.
        if (claim) add(step(`pattern:${origin.pattern}`, () => ({ kind: 'pattern', label: PATTERN_BY_ID[origin.pattern].name, claim: claim.wording })), w, lines)
        else add(collapsed(), w, [])
      } else if (origin.kind === 'goal') {
        const claim = goalClaimFor(GOAL_TO_QUIZ[origin.goal], product)
        // A goal line only beside a product its map backs; otherwise it counts, unsaid.
        if (claim) add(step(`goal:${origin.goal}`, () => ({ kind: 'goal', label: GOAL_LABEL[origin.goal], claim: claim.wording })), w, [source.why])
        else add(collapsed(), w, [])
      } else {
        const claim = needClaimFor(need, product)
        add(claim ? step(`need:${need}`, () => ({ kind: 'need', label: NEED_LABEL[need], claim: claim.wording })) : collapsed(), w, [source.why])
      }
    }
  }

  const raw = [...steps.values()].filter((s) => s.weight > 0).sort((x, y) => y.weight - x.weight || x.label.localeCompare(y.label)).slice(0, MAX_STEPS)
  if (!raw.length) return null
  const topStep = raw[0].weight
  const topAnswer = Math.max(...raw.flatMap((s) => [...s.answers.values()]), 0)
  return {
    productId: product.id,
    steps: raw.map((s) => ({
      kind: s.kind,
      label: s.label,
      claim: s.claim,
      weight: round(s.weight / topStep),
      answers: [...s.answers.entries()]
        .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
        .slice(0, MAX_ANSWERS)
        .map(([text, w]) => ({ text, weight: topAnswer ? round(w / topAnswer) : 0 })),
    })),
  }
}

const round = (n: number) => Math.round(n * 100) / 100

/** A trace for every product the consult picked. */
export function buildTraces(answers: ConsultAnswers, engine: Pick<EngineResult, 'needs' | 'tiers'>, catalogue: readonly CatalogueProduct[]): Record<string, Trace> {
  const byId = new Map(catalogue.map((p) => [p.id, p]))
  const out: Record<string, Trace> = {}
  for (const id of engine.tiers.complete) {
    const product = byId.get(id)
    const trace = product ? traceFor(product, answers, engine) : null
    if (trace) out[id] = trace
  }
  return out
}

/* ── In this tab only ─────────────────────────────────────────────────── */

const KEY = 'chrgd-consult-traces'

export function saveTraces(consultId: string, traces: Record<string, Trace>): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ consultId, traces }))
  } catch {
    /* No storage: "Why this?" isn't offered after a reload. */
  }
}

export function loadTrace(consultId: string | null | undefined, productId: string): Trace | null {
  if (!consultId) return null
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null') as { consultId?: string; traces?: Record<string, Trace> } | null
    return raw?.consultId === consultId ? (raw.traces?.[productId] ?? null) : null
  } catch {
    return null
  }
}
