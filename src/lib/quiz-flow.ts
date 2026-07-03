import type { QuizTrack } from '@/lib/types'

/**
 * Single source of truth for the quiz's step order and per-track inclusion.
 * `Act2Quiz` derives progress, next/prev/skip and the review jumps from this —
 * replacing the old numeric-index coupling so the flow can't desync.
 *
 * Order leads with the engaging goal question; personal info comes second.
 */
export type StepId =
  | 'goals'
  | 'personal'
  | 'frequency'
  | 'type'
  | 'lifestyle'
  | 'diet'
  | 'deepDive'
  | 'supps'
  | 'caffeine'
  | 'trainingTime'
  | 'formats'
  | 'budget'
  | 'review'

export interface QuizStepDef {
  id: StepId
  section: string
  q: string
  hint: string
  /** Copy overrides for the wellbeing track. */
  wellbeing?: { q?: string; hint?: string }
  /** Tracks that include this step. Omitted = both tracks. */
  tracks?: QuizTrack[]
  /** Single-choice steps auto-advance; multi/compound steps need Continue. */
  advance: 'auto' | 'manual'
}

export const QUIZ_STEPS: QuizStepDef[] = [
  { id: 'goals', section: 'YOUR GOAL', q: "What's the main goal?", hint: "Pick everything that applies — we'll prioritise by what you choose most.", advance: 'manual' },
  { id: 'personal', section: 'ABOUT YOU', q: 'A little about you.', hint: 'Helps us tailor the doses and picks to you.', advance: 'manual' },
  { id: 'frequency', section: 'TRAINING', q: 'How often do you train?', hint: 'Your frequency shapes the whole stack.', tracks: ['performance'], advance: 'auto' },
  { id: 'type', section: 'TRAINING', q: "What's your training style?", hint: 'Pick everything you do — add as many as apply.', tracks: ['performance'], advance: 'manual' },
  { id: 'lifestyle', section: 'LIFESTYLE', q: 'Tell us about yourself', hint: 'Select anything that applies — helps us fine-tune.', wellbeing: { q: 'Tell us about your day-to-day', hint: 'Select anything that applies — context changes what we recommend.' }, advance: 'manual' },
  { id: 'diet', section: 'NUTRITION', q: "How's the diet?", hint: 'Honest answer = better results.', advance: 'auto' },
  { id: 'deepDive', section: 'GOING DEEPER', q: 'A couple of quick follow-ups.', hint: 'Written for you, based on what you’ve told us so far.', advance: 'manual' },
  { id: 'supps', section: 'WHAT YOU HAVE', q: 'Already using any of these?', hint: "We won't recommend what you've already got.", wellbeing: { q: 'Already taking any of these?', hint: "We won't recommend what you've already got covered." }, advance: 'manual' },
  { id: 'caffeine', section: 'ENERGY', q: 'How do you handle caffeine?', hint: 'Shapes your pre-workout recommendation.', advance: 'auto' },
  { id: 'trainingTime', section: 'TRAINING', q: 'When do you usually train?', hint: 'Caffeine timing matters — tells us whether to include stimulants.', wellbeing: { q: 'When do you usually move or exercise?', hint: 'Even light exercise timing affects what we recommend.' }, advance: 'auto' },
  { id: 'formats', section: 'YOUR STYLE', q: 'What formats do you prefer?', hint: "We'll match your stack to products you'll actually use.", advance: 'manual' },
  { id: 'budget', section: 'BUDGET', q: "What's your stack budget?", hint: 'Sets your stack size — almost there.', advance: 'manual' },
  { id: 'review', section: 'REVIEW', q: 'Quick check before we build.', hint: 'Tap anything to change it.', advance: 'manual' },
]

/** The steps shown for a track. Null (track not yet chosen) defaults to the
 *  performance sequence so the step count is stable on the first screen. */
export function activeSteps(track: QuizTrack | null): QuizStepDef[] {
  const t = track ?? 'performance'
  return QUIZ_STEPS.filter((s) => !s.tracks || s.tracks.includes(t))
}

/** Resolved question copy for a step on a given track. */
export function stepCopy(def: QuizStepDef, track: QuizTrack | null): { section: string; q: string; hint: string } {
  const o = track === 'wellbeing' ? def.wellbeing : undefined
  return { section: def.section, q: o?.q ?? def.q, hint: o?.hint ?? def.hint }
}
