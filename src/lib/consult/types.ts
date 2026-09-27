import type { HealthDataConsent } from '@/lib/types'

import type { PatternId, PinpointAnswer } from './pinpoint/types'
import type { TrainingAnswer } from './training'

/**
 * The Amp Consult's answer model.
 *
 * Every answer the consult collects lives in one `ConsultAnswers` object. Each
 * field is `null` until its scene has been answered, so "answered" and
 * "answered with nothing" stay different things: `body: []` means "no stiff or
 * sore spots", `body: null` means the scene hasn't been reached.
 */

export type SceneId =
  | 'goals'
  | 'about'
  | 'training'
  | 'aim'
  | 'energy'
  | 'sleep'
  | 'daylight'
  | 'caffeine'
  | 'food'
  | 'body'
  | 'changes'
  | 'shelf'
  | 'review'
  | 'circuit'
  /** Pinpoint (plan v5): a follow-up after each core section, and the round. */
  | 'follow-move'
  | 'follow-rest'
  | 'follow-fuel'
  | 'pinpoint'

export type SectionId = 'you' | 'move' | 'rest' | 'fuel' | 'body' | 'pinpoint' | 'check'

export type ConsultGoal = 'performance' | 'energy' | 'sleep' | 'focus' | 'ageing' | 'allround' | 'weight'

/** `under-18` exists only to stop the consult: CHRGD is for adults (the 18+ gate, V5). */
export type AgeBand = 'under-18' | '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65-plus'

export type Sex = 'female' | 'male' | 'unsaid'

export type DayType = 'rest' | 'gym' | 'cardio' | 'sport'

export type SleepQuality = 'broken' | 'ok' | 'restful'

/** How often they get daylight, on the sun arc's four steps. */
export type Daylight = 'hardly' | 'some' | 'most' | 'daily'

export type Food =
  | 'oily-fish'
  | 'red-meat'
  | 'poultry'
  | 'eggs'
  | 'dairy'
  | 'beans'
  | 'greens'
  | 'fruit'
  | 'nuts'
  | 'wholegrains'

export type BodySpot = 'neck' | 'shoulders' | 'lower-back' | 'hips' | 'knees'

export type ShelfItem =
  | 'multivitamin'
  | 'vitamin-d'
  | 'creatine'
  | 'protein'
  | 'omega-3'
  | 'pre-workout'
  | 'magnesium'
  | 'collagen'

/**
 * The circuit check's questions. `shellfish` isn't in the build plan's list; it
 * is here because the catalogue carries shellfish-derived products (krill oil,
 * glucosamine) and the quiz's own safety screen already asks it.
 */
export type CircuitFlag = 'pregnancy' | 'blood-thinners' | 'other-prescription' | 'heart' | 'kidney-liver' | 'shellfish' | 'weight-meds'

/**
 * What someone on weight-loss medication has noticed since starting it. Only
 * asked, and only used, with the tailoring consent (`tailorConsent`).
 */
export type WeightSymptom = 'low-appetite' | 'nausea' | 'constipation' | 'tiredness'

/**
 * Speed run (fewer scenes, about a minute), deep charge (everything), or
 * Pinpoint (everything, then follow-ups until Amp knows what's going on; plan v5).
 */
export type Route = 'speed' | 'deep' | 'pinpoint'

/** What a builder is training for (the builder journey's own question). */
export type TrainingAim = 'muscle' | 'strength' | 'sport' | 'endurance'

/** What's got harder lately (the active-ager journey's own question). `[]` is "Nothing's changed". */
export type AgeingChange = 'getting-about' | 'strength' | 'staying-sharp' | 'energy' | 'sleeping-through'

/** How hard most sessions feel. Asked on the training week for performance goals. */
export type Intensity = 'easy' | 'steady' | 'hard'

export interface SleepAnswer {
  /** Minutes past midnight. A bedtime before midnight is stored as-is (e.g. 23:00 → 1380). */
  bed: number
  wake: number
  quality: SleepQuality | null
}

export interface CaffeineAnswer {
  coffee: number
  tea: number
  energy: number
}

export interface CircuitAnswer {
  flags: CircuitFlag[]
  /** "None of these", ticked explicitly. Never inferred from an empty list. */
  none: boolean
}

/** A pattern the notes point to, and why: "Energy swings week to week". */
export interface NoteHint {
  pattern: PatternId
  why: string
}

export interface ConsultAnswers {
  route: Route | null
  /** In priority order: goals[0] counts most. At most three. */
  goals: ConsultGoal[]
  age: AgeBand | null
  sex: Sex | null
  /** The training answer: a usual week day by day, or an average when it varies. See `training.ts`. */
  training: TrainingAnswer | null
  /** Only asked when performance is a goal (the training week's detail). */
  intensity: Intensity | null
  /** Builders only: what the training is for. */
  aim: TrainingAim | null
  /** Active agers only: what's got harder lately. */
  changes: AgeingChange[] | null
  /** Afternoon energy, 1–10. */
  energy: number | null
  sleep: SleepAnswer | null
  daylight: Daylight | null
  caffeine: CaffeineAnswer | null
  plate: Food[] | null
  body: BodySpot[] | null
  shelf: ShelfItem[] | null
  circuit: CircuitAnswer | null
  /**
   * Explicit consent to use the circuit check's answers (Article 9). The
   * check's toggles are inert until this is given, and it is the same notice
   * and version the quiz's safety screen uses.
   */
  healthConsent: HealthDataConsent | null
  /**
   * A second, separate opt-in on the circuit check: use weight-loss
   * medication to *add* to the stack, not only to keep things out. Health
   * data like the circuit answers: never saved to the device, never sent to AI.
   */
  tailorConsent: HealthDataConsent | null
  /** Symptoms since starting weight-loss medication. `[]` is "None of these". Same handling as the above. */
  symptoms: WeightSymptom[] | null
  /** Comfort mode: bigger type and targets, fiddly widgets swapped for buttons. */
  comfort: boolean
  /** Whether comfort mode has been offered (so the offer is made once). */
  comfortOffered: boolean
  /** Free text from "Tell Amp more", per scene. Optional, never required. */
  notes: Partial<Record<SceneId, string>>
  /** The Pinpoint route's follow-ups, hunches and verdicts (plan v5). Null on the other routes. */
  pinpoint: PinpointAnswer | null
  /**
   * What the notes from typed answers point to, read together (plan v5 §7):
   * a pattern and why, in the member's terms. Null until read; cleared when a
   * note changes. A nudge and a piece of evidence for Pinpoint, never a hunch.
   */
  noteHints: NoteHint[] | null
}

export const EMPTY_ANSWERS: ConsultAnswers = {
  route: null,
  goals: [],
  age: null,
  sex: null,
  training: null,
  intensity: null,
  aim: null,
  changes: null,
  energy: null,
  sleep: null,
  daylight: null,
  caffeine: null,
  plate: null,
  body: null,
  shelf: null,
  circuit: null,
  healthConsent: null,
  tailorConsent: null,
  symptoms: null,
  comfort: false,
  comfortOffered: false,
  notes: {},
  pinpoint: null,
  noteHints: null,
}
