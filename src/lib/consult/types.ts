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
  | 'energy'
  | 'sleep'
  | 'daylight'
  | 'caffeine'
  | 'food'
  | 'body'
  | 'shelf'
  | 'review'
  | 'circuit'

export type SectionId = 'you' | 'move' | 'rest' | 'fuel' | 'body' | 'check'

export type ConsultGoal = 'performance' | 'energy' | 'sleep' | 'focus' | 'ageing' | 'allround'

export type AgeBand = '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65-plus'

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

export type CircuitFlag = 'pregnancy' | 'blood-thinners' | 'other-prescription' | 'heart' | 'kidney-liver'

/** Speed run (fewer scenes, about a minute) or deep charge (everything). */
export type Route = 'speed' | 'deep'

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

export interface ConsultAnswers {
  route: Route | null
  /** In priority order: goals[0] counts most. At most three. */
  goals: ConsultGoal[]
  age: AgeBand | null
  sex: Sex | null
  /** Monday first; seven entries once answered. */
  week: DayType[] | null
  /** Afternoon energy, 1–10. */
  energy: number | null
  sleep: SleepAnswer | null
  daylight: Daylight | null
  caffeine: CaffeineAnswer | null
  plate: Food[] | null
  body: BodySpot[] | null
  shelf: ShelfItem[] | null
  circuit: CircuitAnswer | null
  /** Comfort mode: bigger type and targets, fiddly widgets swapped for buttons. */
  comfort: boolean
  /** Free text from "Tell Amp more", per scene. Optional, never required. */
  notes: Partial<Record<SceneId, string>>
}

export const EMPTY_ANSWERS: ConsultAnswers = {
  route: null,
  goals: [],
  age: null,
  sex: null,
  week: null,
  energy: null,
  sleep: null,
  daylight: null,
  caffeine: null,
  plate: null,
  body: null,
  shelf: null,
  circuit: null,
  comfort: false,
  notes: {},
}
