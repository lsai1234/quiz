import type { QuizTrack, QuizAnswers } from '@/lib/types'

/**
 * Single source of truth for the quiz's step order and per-track inclusion.
 * `Act2Quiz` derives progress, next/prev/skip and the review jumps from this —
 * replacing the old numeric-index coupling so the flow can't desync.
 *
 * Order leads with the engaging goal question; personal info comes second.
 */
export type StepId =
  | 'goals'
  | 'safety'
  | 'personal'
  | 'frequency'
  | 'type'
  | 'lifestyle'
  | 'diet'
  | 'deepDive'
  | 'supps'
  | 'caffeine'
  | 'trainingTime'
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
  /** Tracks that include this step. Omitted = both tracks. */
  tracks?: QuizTrack[]
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
  { id: 'goals', section: 'YOUR GOAL', q: "What's the main goal?", hint: "Pick everything that applies. The first one you tap is the one we lead with.", select: 'multi', advance: 'manual' },
  // Safety screen — front-loaded so it filters everything downstream. Ticking a
  // flag removes contraindicated products from the recommendation entirely.
  { id: 'safety', section: 'ABOUT YOU', q: 'Anything we should factor in?', hint: 'This only ever takes products out of your box — it never adds any.', select: 'optional', advance: 'manual' },
  { id: 'personal', section: 'ABOUT YOU', q: 'A little about you.', hint: 'Age and weight set the doses. The name is just so we can talk to you properly.', select: 'form', advance: 'manual' },
  { id: 'frequency', section: 'TRAINING', q: 'How often do you train?', hint: 'This changes the size of the box more than anything else you’ll tell us.', select: 'one', tracks: ['performance'], advance: 'auto' },
  { id: 'type', section: 'TRAINING', q: "What's your main training style?", hint: "Pick the closest one — we build around it.", select: 'one', tracks: ['performance'], advance: 'manual' },
  { id: 'lifestyle', section: 'LIFESTYLE', q: 'Anything else going on?', hint: 'Tick anything that applies. Skip it if none of them do.', select: 'optional', wellbeing: { q: 'Anything else going on day to day?', hint: 'Tick anything that applies — each one changes what we’d send.' }, advance: 'manual' },
  { id: 'diet', section: 'NUTRITION', q: 'How do most of your meals happen?', hint: 'No judgement — it just points us to the right gaps.', select: 'one', advance: 'auto' },
  { id: 'supps', section: 'WHAT YOU HAVE', q: 'Already using any of these?', hint: "We'll skip what you've got — or tell us to include ours so you can try it.", select: 'optional', wellbeing: { q: 'Already taking any of these?', hint: "We'll skip what you've got covered — or tell us to include ours so you can try it." }, advance: 'manual' },
  // Caffeine + training-time only change the bundle when a stimulant product can
  // enter it — i.e. the performance track. Skipped for the pure wellbeing track.
  { id: 'caffeine', section: 'ENERGY', q: 'How do you handle caffeine?', hint: 'This decides whether a stimulant belongs in your box at all.', select: 'one', showWhen: (a) => a.track === 'performance', advance: 'auto' },
  { id: 'trainingTime', section: 'TRAINING', q: 'When do you usually train?', hint: 'A stimulant at 7pm becomes a sleep problem, so we need to know.', select: 'one', showWhen: (a) => a.track === 'performance', advance: 'auto' },
  // No budget question: we build the full stack and let the customer choose a
  // depth (Essentials / Balanced / Complete) on the results screen, where they
  // can see the value before the price (value-first — see StackReviewPage tiers).
  { id: 'review', section: 'REVIEW', q: 'Quick check before we build.', hint: 'Tap anything to change it.', select: 'form', advance: 'manual' },
  // Optional bonus step, offered from the review screen — never part of the
  // advertised question count or the linear flow.
  { id: 'deepDive', section: 'GO DEEPER', q: 'Let’s fine-tune your stack.', hint: 'Optional — a few more questions, and we can be more specific.', select: 'form', advance: 'manual' },
]

/** The steps shown for a track. Null (track not yet chosen) defaults to the
 *  performance sequence so the step count is stable on the first screen.
 *  Pass `answers` to also apply per-step `showWhen` gates (conditional steps);
 *  without it, conditional steps are included (stable count on the first screen).*/
export function activeSteps(
  track: QuizTrack | null,
  answers?: Pick<QuizAnswers, 'track'>,
): QuizStepDef[] {
  const t = track ?? 'performance'
  return QUIZ_STEPS.filter(
    (s) =>
      (!s.tracks || s.tracks.includes(t)) &&
      (!answers || !s.showWhen || s.showWhen(answers)),
  )
}

/** Resolved question copy for a step on a given track. */
export function stepCopy(
  def: QuizStepDef,
  track: QuizTrack | null,
): { section: string; q: string; hint: string } {
  const o = track === 'wellbeing' ? def.wellbeing : undefined
  return { section: def.section, q: o?.q ?? def.q, hint: o?.hint ?? def.hint }
}
