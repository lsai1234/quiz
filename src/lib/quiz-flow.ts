import type { QuizTrack } from '@/lib/types'

/**
 * Single source of truth for the quiz's step order and per-track inclusion.
 * `Act2Quiz` derives progress, next/prev/skip and the review jumps from this —
 * replacing the old numeric-index coupling so the flow can't desync.
 *
 * Order leads with the engaging goal question; personal info comes second.
 *
 * CHRGD LQD (drinks mode) rides on top of the track: same sequence, minus the
 * formats question (the answer is implied — drinks), with LQD copy overrides
 * where the framing changes.
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
  /** Copy overrides for LQD drinks mode (applied after the track override). */
  lqd?: { q?: string; hint?: string }
  /** Tracks that include this step. Omitted = both tracks. */
  tracks?: QuizTrack[]
  /** Skip this step entirely in LQD drinks mode. */
  skipInDrinksMode?: boolean
  /** Single-choice steps auto-advance; multi/compound steps need Continue. */
  advance: 'auto' | 'manual'
}

export const QUIZ_STEPS: QuizStepDef[] = [
  { id: 'goals', section: 'YOUR GOAL', q: "What's the main goal?", hint: "Pick everything that applies — we'll prioritise by what you choose most.", advance: 'manual' },
  { id: 'personal', section: 'ABOUT YOU', q: 'A little about you.', hint: 'Helps us tailor the doses and picks to you.', advance: 'manual' },
  { id: 'frequency', section: 'TRAINING', q: 'How often do you train?', hint: 'Your frequency shapes the whole stack.', tracks: ['performance'], lqd: { hint: 'Your frequency shapes the whole package.' }, advance: 'auto' },
  { id: 'type', section: 'TRAINING', q: "What's your training style?", hint: 'Pick everything you do — add as many as apply.', tracks: ['performance'], advance: 'manual' },
  { id: 'lifestyle', section: 'LIFESTYLE', q: 'Tell us about yourself', hint: 'Select anything that applies — helps us fine-tune.', wellbeing: { q: 'Tell us about your day-to-day', hint: 'Select anything that applies — context changes what we recommend.' }, advance: 'manual' },
  { id: 'diet', section: 'NUTRITION', q: "How's the diet?", hint: 'Honest answer = better results.', advance: 'auto' },
  { id: 'supps', section: 'WHAT YOU HAVE', q: 'Already using any of these?', hint: "We'll skip what you've got — or tell us to include ours so you can try it.", wellbeing: { q: 'Already taking any of these?', hint: "We'll skip what you've got covered — or tell us to include ours so you can try it." }, advance: 'manual' },
  { id: 'caffeine', section: 'ENERGY', q: 'How do you handle caffeine?', hint: 'Shapes your pre-workout recommendation.', advance: 'auto' },
  { id: 'trainingTime', section: 'TRAINING', q: 'When do you usually train?', hint: 'Caffeine timing matters — tells us whether to include stimulants.', wellbeing: { q: 'When do you usually move or exercise?', hint: 'Even light exercise timing affects what we recommend.' }, advance: 'auto' },
  // LQD implies the format — every pick is a drink — so the step is skipped.
  { id: 'formats', section: 'YOUR STYLE', q: 'What formats do you prefer?', hint: "We'll match your stack to products you'll actually use.", skipInDrinksMode: true, advance: 'manual' },
  { id: 'budget', section: 'BUDGET', q: "What's your stack budget?", hint: 'Sets your stack size — almost there.', lqd: { q: "What's your drinks budget?", hint: 'Sets the size of your monthly package — almost there.' }, advance: 'manual' },
  { id: 'review', section: 'REVIEW', q: 'Quick check before we build.', hint: 'Tap anything to change it.', lqd: { q: 'Quick check before we pour.', hint: 'Tap anything to change it.' }, advance: 'manual' },
  // Optional bonus step, offered from the review screen — never part of the
  // advertised question count or the linear flow.
  { id: 'deepDive', section: 'GO DEEPER', q: 'Let’s fine-tune your stack.', hint: 'Optional — every answer here sharpens the final picks.', lqd: { q: 'Let’s fine-tune your drinks.', hint: 'Optional — every answer here sharpens the final picks.' }, advance: 'manual' },
]

/** The steps shown for a track. Null (track not yet chosen) defaults to the
 *  performance sequence so the step count is stable on the first screen. */
export function activeSteps(track: QuizTrack | null, drinksMode = false): QuizStepDef[] {
  const t = track ?? 'performance'
  return QUIZ_STEPS.filter((s) => (!s.tracks || s.tracks.includes(t)) && !(drinksMode && s.skipInDrinksMode))
}

/** Resolved question copy for a step on a given track (+ LQD overrides). */
export function stepCopy(
  def: QuizStepDef,
  track: QuizTrack | null,
  drinksMode = false,
): { section: string; q: string; hint: string } {
  const o = track === 'wellbeing' ? def.wellbeing : undefined
  const l = drinksMode ? def.lqd : undefined
  return { section: def.section, q: l?.q ?? o?.q ?? def.q, hint: l?.hint ?? o?.hint ?? def.hint }
}
