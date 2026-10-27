/**
 * "Your read" (Amp Consult and offer plan, Phase 5): what the consult found,
 * as data, built once from the answers and the engine (`prepareResults`) and
 * shown twice: on Fully charged, and at the top of the results page.
 *
 *   patterns   Each pinpointed or partly pinpointed pattern: its name, its
 *              line, and the evidence in the person's own words.
 *   words      With nothing pinpointed (Speed and Deep runs), the charge
 *              profile in words, as before; the hexagon is drawn from it.
 *   identity   The top pinpointed pattern names the result and the share card
 *              ("Wired and tired"). Never the weight-loss pattern: a share
 *              card never carries weight-loss tailoring. None: the goal-based
 *              stack name.
 *   habits     "Try this week" and "Worth a GP check": every line that applies,
 *              with ids, so only approved ones are shown when it is drawn.
 *   unmet      Goals nothing we stock meets, said honestly, with a fix.
 *   checked    The engine's "Kept out" and "Skipped" notes.
 *   products   Each product's claims-aware reason and the claim beside it.
 *
 * Plain data: it survives a reload in this tab (`results.ts`).
 */
import type { ChargeProfile } from './profile'
import { chargeProfile, profileInWords } from './profile'
import { NEUTRAL_REASON, type EngineResult } from './engine'
import { pinpointed } from './pinpoint/effects'
import { hunchEvidence } from './pinpoint/playback'
import type { PatternId } from './pinpoint/types'
import { gpChecksFor, type GpLine } from './gp-check'
import { habitForGoal, habitsFor, type HabitLine } from './habits'
import type { ConsultAnswers, ConsultGoal } from './types'

export interface ReadPattern {
  id: PatternId
  name: string
  line: string
  state: 'yes' | 'partly'
  /** Their answers, as they gave them: "4 coffees a day", "Flat by 3pm". */
  evidence: string[]
}

export interface ConsultRead {
  consultId: string
  identity: string | null
  patterns: ReadPattern[]
  /** Amp's "found" line, when the AI wrote one during the round. */
  found: string | null
  words: string | null
  profile: ChargeProfile | null
  habits: HabitLine[]
  gp: GpLine[]
  unmet: { goal: ConsultGoal; habit: HabitLine | null }[]
  checked: string[]
  products: Record<string, { reason: string | null; claim: string | null }>
}

/** Patterns that never name a result or a share card. */
const NEVER_NAMES: readonly PatternId[] = ['eating-less']

export function readIdentity(patterns: readonly Pick<ReadPattern, 'id' | 'name'>[]): string | null {
  return patterns.find((p) => !NEVER_NAMES.includes(p.id))?.name ?? null
}

export function buildRead(input: {
  consultId: string
  answers: ConsultAnswers
  engine: Pick<EngineResult, 'ranked' | 'notes' | 'unmetGoals'>
  found?: string | null
}): ConsultRead {
  const a = input.answers
  const patterns: ReadPattern[] = pinpointed(a).map((l) => ({
    id: l.pattern.id,
    name: l.pattern.name,
    line: l.pattern.line,
    state: l.state === 'yes' ? 'yes' : 'partly',
    evidence: hunchEvidence(l),
  }))
  const unmet = [...input.engine.unmetGoals]
  return {
    consultId: input.consultId,
    identity: readIdentity(patterns),
    patterns,
    found: patterns.length ? input.found ?? null : null,
    words: patterns.length ? null : profileInWords(a) || null,
    profile: patterns.length ? null : chargeProfile(a),
    habits: habitsFor(a, unmet),
    gp: gpChecksFor(a),
    unmet: unmet.map((goal) => ({ goal, habit: habitForGoal(a, goal) })),
    checked: input.engine.notes.filter((n) => /^(Kept out|Skipped):/.test(n)),
    products: Object.fromEntries(
      input.engine.ranked.map((r) => [r.id, { reason: r.reason === NEUTRAL_REASON ? null : r.reason, claim: r.reasonClaim }]),
    ),
  }
}
