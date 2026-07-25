import type { QuizTrack, QuizAnswers } from '@/lib/types'

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
  | 'dailyDrinks'
  | 'workoutAddOns'
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
  | 'review'

/**
 * How the user answers a step — drives the little "how to answer" pill so they
 * never have to guess whether one tap moves on or they pick several:
 *   'one'      → pick a single option (auto-advances)
 *   'multi'    → pick as many as apply, then Continue
 *   'optional' → pick any that apply or skip
 *   'form'     → free entry / mixed fields (no pill)
 */
export type SelectMode = 'one' | 'multi' | 'optional' | 'form'

export interface QuizStepDef {
  id: StepId
  section: string
  q: string
  hint: string
  /** How the step is answered — drives the guidance pill (see SelectMode). */
  select: SelectMode
  /** Copy overrides for the wellbeing track. */
  wellbeing?: { q?: string; hint?: string }
  /** Copy overrides for LQD drinks mode (applied after the track override). */
  lqd?: { q?: string; hint?: string }
  /** Tracks that include this step. Omitted = both tracks. */
  tracks?: QuizTrack[]
  /** Skip this step entirely in LQD drinks mode. */
  skipInDrinksMode?: boolean
  /** Show this step ONLY in LQD drinks mode (e.g. the drinks/day pace). */
  onlyInDrinksMode?: boolean
  /**
   * Conditional inclusion based on the answers so far — used to skip questions
   * that can't change the bundle for this user (e.g. caffeine/training-time only
   * matter when a stimulant product could enter, i.e. the performance track).
   * Evaluated only when answers are passed to `activeSteps`; absent = always shown.
   */
  showWhen?: (a: Pick<QuizAnswers, 'track'>) => boolean
  /** Single-choice steps auto-advance; multi/compound steps need Continue. */
  advance: 'auto' | 'manual'
}

/** The guidance-pill label for a select mode (null = no pill). */
export function selectHint(mode: SelectMode): string | null {
  switch (mode) {
    case 'one': return 'Pick one'
    case 'multi': return 'Pick all that apply'
    case 'optional': return 'Pick any — or skip'
    default: return null
  }
}

export const QUIZ_STEPS: QuizStepDef[] = [
  { id: 'goals', section: 'YOUR GOAL', q: "What's the main goal?", hint: "Pick everything that applies — we'll prioritise by what you choose most.", select: 'multi', lqd: { hint: 'Pick everything that applies — we’ll cover it all with ready-made drinks.' }, advance: 'manual' },
  // LQD FOUNDATION — the everyday base, shown to everyone in drinks mode.
  { id: 'dailyDrinks', section: 'YOUR DAILY DRINKS', q: 'How many drinks on a normal day?', hint: "Your everyday base — it just helps us size the box.", select: 'one', onlyInDrinksMode: true, advance: 'auto' },
  // LQD WORKOUT ADD-ONS — training route only; a single opt-in pre-workout toggle.
  { id: 'workoutAddOns', section: 'WORKOUT DRINKS', q: 'Add a pre-workout drink?', hint: 'Optional — a training-day drink on top of your everyday base.', select: 'optional', tracks: ['performance'], onlyInDrinksMode: true, advance: 'manual' },
  { id: 'personal', section: 'ABOUT YOU', q: 'A little about you.', hint: 'Helps us tailor the doses and picks to you.', select: 'form', advance: 'manual' },
  { id: 'frequency', section: 'TRAINING', q: 'How often do you train?', hint: 'Your frequency shapes the whole stack.', select: 'one', tracks: ['performance'], lqd: { hint: 'Your frequency shapes the whole package.' }, advance: 'auto' },
  { id: 'type', section: 'TRAINING', q: "What's your main training style?", hint: "Pick the one that fits best — we'll tune around it.", select: 'one', tracks: ['performance'], advance: 'manual' },
  { id: 'lifestyle', section: 'LIFESTYLE', q: 'Tell us about yourself', hint: 'Select anything that applies — helps us fine-tune.', select: 'optional', wellbeing: { q: 'Tell us about your day-to-day', hint: 'Select anything that applies — context changes what we recommend.' }, advance: 'manual' },
  { id: 'diet', section: 'NUTRITION', q: 'How do most of your meals happen?', hint: 'No judgement — it just points us to the right gaps.', select: 'one', advance: 'auto' },
  { id: 'supps', section: 'WHAT YOU HAVE', q: 'Already using any of these?', hint: "We'll skip what you've got — or tell us to include ours so you can try it.", select: 'optional', wellbeing: { q: 'Already taking any of these?', hint: "We'll skip what you've got covered — or tell us to include ours so you can try it." }, advance: 'manual' },
  // Caffeine + training-time only change the bundle when a stimulant product can
  // enter it — i.e. the performance track. Skipped for the pure wellbeing track.
  { id: 'caffeine', section: 'ENERGY', q: 'How do you handle caffeine?', hint: 'Shapes your pre-workout recommendation.', select: 'one', showWhen: (a) => a.track === 'performance', advance: 'auto' },
  { id: 'trainingTime', section: 'TRAINING', q: 'When do you usually train?', hint: 'Caffeine timing matters — tells us whether to include stimulants.', select: 'one', showWhen: (a) => a.track === 'performance', advance: 'auto' },
  // LQD implies the format — every pick is a drink — so the step is skipped.
  { id: 'formats', section: 'YOUR STYLE', q: 'What formats do you prefer?', hint: "We'll match your stack to products you'll actually use.", select: 'multi', skipInDrinksMode: true, advance: 'manual' },
  // No budget question: we build the full stack and let the customer choose a
  // depth (Essentials / Balanced / Complete) on the results screen, where they
  // can see the value before the price (value-first — see StackReviewPage tiers).
  { id: 'review', section: 'REVIEW', q: 'Quick check before we build.', hint: 'Tap anything to change it.', select: 'form', lqd: { q: 'Quick check before we pour.', hint: 'Tap anything to change it.' }, advance: 'manual' },
  // Optional bonus step, offered from the review screen — never part of the
  // advertised question count or the linear flow.
  { id: 'deepDive', section: 'GO DEEPER', q: 'Let’s fine-tune your stack.', hint: 'Optional — every answer here sharpens the final picks.', select: 'form', lqd: { q: 'Let’s fine-tune your drinks.', hint: 'Optional — every answer here sharpens the final picks.' }, advance: 'manual' },
]

/** The steps shown for a track. Null (track not yet chosen) defaults to the
 *  performance sequence so the step count is stable on the first screen.
 *  Pass `answers` to also apply per-step `showWhen` gates (conditional steps);
 *  without it, conditional steps are included (stable count on the first screen).*/
export function activeSteps(
  track: QuizTrack | null,
  drinksMode = false,
  answers?: Pick<QuizAnswers, 'track'>,
): QuizStepDef[] {
  const t = track ?? 'performance'
  return QUIZ_STEPS.filter(
    (s) =>
      (!s.tracks || s.tracks.includes(t)) &&
      !(drinksMode && s.skipInDrinksMode) &&
      (drinksMode || !s.onlyInDrinksMode) &&
      (!answers || !s.showWhen || s.showWhen(answers)),
  )
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
