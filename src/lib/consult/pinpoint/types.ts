/**
 * Pinpoint's shapes (plan v5).
 *
 * A *pattern* is a plain-English explanation of how someone feels ("Wired and
 * tired"). A *probe* is a question that tests patterns: one everyday moment
 * and its answers. Each answer pulls on the patterns it points at, towards or
 * away, a little, clearly or strongly. Everything Amp concludes is replayed
 * from the answers, so the same answers always give the same questions and
 * the same result.
 */

import type { Ingredient } from '../circuit'
import type { Journey } from '../journey'
import type { NeedId } from '../knowledge'
import type { ProfileArea } from '../profile'
import type { ConsultAnswers } from '../types'

export type PatternId =
  | 'crash'
  | 'wired'
  | 'short-sleep'
  | 'empty'
  | 'protein-gap'
  | 'not-recovering'
  | 'caffeine-train'
  | 'sweat'
  | 'plant-gap'
  | 'indoor'
  | 'weekend-warrior'
  | 'stiff-starter'
  | 'keeping-strong'
  | 'staying-sharp'
  | 'broken-nights'
  | 'eating-less'

/** How strongly an answer points at a pattern, in the words the library is written in. */
export type Strength = 'a little' | 'clearly' | 'strongly' | 'away a little' | 'away clearly' | 'away strongly'

export type ProbeFormat = 'scenario' | 'this-or-that' | 'how-often' | 'day-line' | 'quick-fire'

/** Where a probe belongs: a follow-up after that section's core screens, or the round. */
export type PinpointArea = 'move' | 'rest' | 'fuel' | 'body'

export type Answers = ConsultAnswers

export interface Nudge {
  when: (a: Answers) => boolean
  towards: Strength
  /** The evidence, in the member's terms: "4 coffees a day". */
  why: string | ((a: Answers) => string)
}

export interface Pattern {
  id: PatternId
  /** "Wired and tired". Plain and friendly, never clinical. */
  name: string
  /** How you'd recognise it: "Caffeine late in the day, slow to drop off, then a crash." */
  line: string
  /** The stack's reason line: "For your 3pm crash". */
  because: string
  journeys: Journey[]
  /** Further conditions for it to be in play at all (a plant-based plate, say). */
  eligible?: (a: Answers) => boolean
  /** Starting score in log-odds, before the core answers nudge it. */
  prior: number
  nudges: Nudge[]
  /** What it adds to the stack's needs when pinpointed. */
  effects: { need: NeedId; weight: number }[]
  /** Ingredients it keeps out of the stack when pinpointed, and why. */
  keepOut?: { ingredients: Ingredient[]; why: string }
  /** The two areas of the charge profile it connects, for the map. */
  links: [ProfileArea, ProfileArea]
}

export interface ProbeOption {
  key: string
  label: string
  /** Signed pull on each pattern (log-scale). Compiled from strength words. */
  pulls: Partial<Record<PatternId, number>>
  /** The evidence this answer gives, if it supports something. */
  said?: string
}

export interface ProbeItem {
  key: string
  /** Quick fire's per-row question; single-item probes use the probe's text. */
  text?: string
  options: ProbeOption[]
  /** How often each option is picked by anyone at all. Defaults per format. */
  base: number[]
}

export interface DayLineSpec {
  /** Minutes past midnight: the ends of the line and the snap. */
  from: number
  to: number
  step: number
  /** Where the marker starts. */
  start: number
  /** Option keys by time: each bucket runs up to `until`. */
  buckets: { key: string; until: number }[]
  /** "Last caffeine about 4pm". */
  said: (minutes: number) => string
}

export interface Probe {
  id: string
  area: PinpointArea
  format: ProbeFormat
  /** The heading: "Sound like you?", "Which is more you?". */
  question: string
  /** The eyebrow over the scenario: "A weekday · 3pm". */
  scene?: string
  /** The scenario, or the day line's hint. About 120 characters at most. */
  text?: string | ((a: Answers) => string)
  items: ProbeItem[]
  /** Only asked when this holds. */
  askIf?: (a: Answers) => boolean
  dayLine?: DayLineSpec
}

export type PinpointStage = 'follow-move' | 'follow-rest' | 'follow-fuel' | 'pinpoint'

export type Verdict = 'yes' | 'partly' | 'no'

export type PinpointStep =
  | {
      kind: 'probe'
      probe: string
      /** Option key per item key. Empty with `unsure`. */
      answer: Record<string, string>
      /** The day line's exact time, for the evidence line. */
      minutes?: number
      unsure?: boolean
      stage: PinpointStage
    }
  | { kind: 'verdict'; pattern: PatternId; verdict: Verdict; stage: 'pinpoint' }
  | { kind: 'checkpoint'; choice: 'more' | 'build'; stage: 'pinpoint' }

export interface PinpointAnswer {
  steps: PinpointStep[]
  /** "Build my stack now". */
  stopped: boolean
}
