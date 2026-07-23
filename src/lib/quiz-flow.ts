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
  | 'dailyDrinks'
  | 'drinkVariety'
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
  | 'budget'
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
  { id: 'dailyDrinks', section: 'YOUR DAILY DRINKS', q: 'How many drinks on a normal day?', hint: "Your everyday base — no need to hit it exactly. We'll pour a month to match.", select: 'one', onlyInDrinksMode: true, advance: 'auto' },
  { id: 'drinkVariety', section: 'YOUR DAILY DRINKS', q: 'Same drinks daily, or a mix?', hint: 'Do you want your go-to staples every day, or a rotating mix across the month?', select: 'one', onlyInDrinksMode: true, advance: 'auto' },
  // LQD WORKOUT ADD-ONS — training route only; opt-in drinks around sessions.
  { id: 'workoutAddOns', section: 'WORKOUT DRINKS', q: 'Add workout drinks?', hint: 'Optional extras around your training — sized to how often you train.', select: 'optional', tracks: ['performance'], onlyInDrinksMode: true, advance: 'manual' },
  { id: 'personal', section: 'ABOUT YOU', q: 'A little about you.', hint: 'Helps us tailor the doses and picks to you.', select: 'form', advance: 'manual' },
  { id: 'frequency', section: 'TRAINING', q: 'How often do you train?', hint: 'Your frequency shapes the whole stack.', select: 'one', tracks: ['performance'], lqd: { hint: 'Your frequency shapes the whole package.' }, advance: 'auto' },
  { id: 'type', section: 'TRAINING', q: "What's your training style?", hint: 'Pick everything you do — add as many as apply.', select: 'multi', tracks: ['performance'], advance: 'manual' },
  { id: 'lifestyle', section: 'LIFESTYLE', q: 'Tell us about yourself', hint: 'Select anything that applies — helps us fine-tune.', select: 'optional', wellbeing: { q: 'Tell us about your day-to-day', hint: 'Select anything that applies — context changes what we recommend.' }, advance: 'manual' },
  { id: 'diet', section: 'NUTRITION', q: "How's the diet?", hint: 'Honest answer = better results.', select: 'one', advance: 'auto' },
  { id: 'supps', section: 'WHAT YOU HAVE', q: 'Already using any of these?', hint: "We'll skip what you've got — or tell us to include ours so you can try it.", select: 'optional', wellbeing: { q: 'Already taking any of these?', hint: "We'll skip what you've got covered — or tell us to include ours so you can try it." }, advance: 'manual' },
  { id: 'caffeine', section: 'ENERGY', q: 'How do you handle caffeine?', hint: 'Shapes your pre-workout recommendation.', select: 'one', advance: 'auto' },
  { id: 'trainingTime', section: 'TRAINING', q: 'When do you usually train?', hint: 'Caffeine timing matters — tells us whether to include stimulants.', select: 'one', wellbeing: { q: 'When do you usually move or exercise?', hint: 'Even light exercise timing affects what we recommend.' }, advance: 'auto' },
  // LQD implies the format — every pick is a drink — so the step is skipped.
  { id: 'formats', section: 'YOUR STYLE', q: 'What formats do you prefer?', hint: "We'll match your stack to products you'll actually use.", select: 'multi', skipInDrinksMode: true, advance: 'manual' },
  // LQD skips the bundle chooser entirely — the drinks/day pace already sizes
  // the package, so asking for a budget would be a second answer to the same
  // question.
  { id: 'budget', section: 'BUDGET', q: "What's your stack budget?", hint: 'Sets your stack size — almost there.', select: 'one', skipInDrinksMode: true, advance: 'manual' },
  { id: 'review', section: 'REVIEW', q: 'Quick check before we build.', hint: 'Tap anything to change it.', select: 'form', lqd: { q: 'Quick check before we pour.', hint: 'Tap anything to change it.' }, advance: 'manual' },
  // Optional bonus step, offered from the review screen — never part of the
  // advertised question count or the linear flow.
  { id: 'deepDive', section: 'GO DEEPER', q: 'Let’s fine-tune your stack.', hint: 'Optional — every answer here sharpens the final picks.', select: 'form', lqd: { q: 'Let’s fine-tune your drinks.', hint: 'Optional — every answer here sharpens the final picks.' }, advance: 'manual' },
]

/** The steps shown for a track. Null (track not yet chosen) defaults to the
 *  performance sequence so the step count is stable on the first screen. */
export function activeSteps(track: QuizTrack | null, drinksMode = false): QuizStepDef[] {
  const t = track ?? 'performance'
  return QUIZ_STEPS.filter(
    (s) =>
      (!s.tracks || s.tracks.includes(t)) &&
      !(drinksMode && s.skipInDrinksMode) &&
      (drinksMode || !s.onlyInDrinksMode),
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
