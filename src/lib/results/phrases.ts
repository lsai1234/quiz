/**
 * Every sentence the results page shows for "Built from your answers" and
 * "What we checked", in one file for review.
 *
 * Rules every line here follows:
 * - It restates what the person told us, or what we did. It never says or
 *   implies what a product does. The only words about a product's effect on
 *   the page are its register claim, verbatim, shown beside the line.
 * - A health goal is only said through the goal-to-claim map
 *   (goal-claims.ts). Goals the map does not back have no line here.
 * - Nothing from the safety screen (pregnancy, medication, allergies) and
 *   nothing that reads like medical screening.
 * - No pressure wording. UK English.
 *
 * Nothing here is written by AI, and nothing else on the page should add to
 * these lines.
 */

import type { DietLevel, Goal, TrainingExperience, TrainingFrequency } from '@/lib/types'

/** Section headings. */
export const RESULTS_HEADINGS = {
  builtFromAnswers: 'Built from your answers',
  whatWeChecked: 'What we checked',
  /** Products with no line, by name and type only, after the ones that have one. */
  alsoInStack: 'Also in your stack',
  /** The same list when no product has a line. */
  inStack: 'In your stack',
} as const

/**
 * "You said ..." for a goal, shown above the product name and its claim.
 * Only goals the map backs are listed; the wording follows the quiz's own
 * goal labels (quiz-goals.ts).
 */
export const GOAL_LINES: Partial<Record<Goal, string>> = {
  muscle: 'You said you want to build muscle.',
  bulking: 'You said you want to gain mass.',
  performance: 'You said you’re after peak performance.',
  energy: 'You said you want more energy.',
  immune: 'You said you want immune support.',
  health: 'You said you want to feel healthier.',
}

/**
 * Lines from answers that are not about health: how someone trains and how
 * they eat. Shown above the product name and its claim, in place of a goal
 * line when one of these moved the product most.
 *
 * Wording follows the v1 quiz options (Act2Quiz.tsx). The v2 quiz sets
 * trainingFocus and trainingExperience from its "training shape" answer
 * without asking them directly, so for v2 these lines are our reading of
 * what was said.
 */
export const ANSWER_LINES = {
  /** No score term reads frequency today, so these are not shown yet. Kept so the set is complete. */
  trainingFrequency: {
    '1-2x': 'You train once or twice a week.',
    '3-4x': 'You train 3–4 times a week.',
    '5-6x': 'You train 5–6 times a week.',
    daily: 'You train every day.',
  } satisfies Record<TrainingFrequency, string>,
  /** The strength and sport follow-ups ("Primary goal with weights?", "Which sport?"). */
  trainingFocus: {
    hypertrophy: 'You lift to build size.',
    powerlifting: 'You lift for raw strength.',
    general: 'You lift for general fitness.',
    football: 'You play football.',
    rugby: 'You play rugby.',
    basketball: 'You play basketball or a court sport.',
    other: 'You play sport.',
  } as Record<string, string>,
  /** "How long at this training level?" */
  trainingExperience: {
    new: 'You’ve been training at this level for under 6 months.',
    intermediate: 'You’ve been training at this level for 6 months to 2 years.',
    experienced: 'You’ve been training at this level for more than 2 years.',
  } satisfies Record<TrainingExperience, string>,
  /** "How do most of your meals happen?" */
  diet: {
    clean: 'You said most of your meals are cooked from scratch.',
    'mostly-good': 'You said your meals are decent but rushed.',
    inconsistent: 'You said you mostly grab whatever’s easy.',
    poor: 'You said your meals are all over the place right now.',
  } satisfies Record<DietLevel, string>,
}

export type AnswerField = keyof typeof ANSWER_LINES

/**
 * "What we checked": one line per thing the engine did for this person.
 * Each says what we left out or limited, then the answer behind it.
 */
export const CHECK_LINES = {
  /** Keyed by the "already using" item that left a product out. */
  alreadyTaking: {
    multivitamin: 'Left out a multivitamin: you said you already take one.',
    'vitamin-d': 'Left out vitamin D: you said you already take it.',
    'omega-3': 'Left out omega-3: you said you already take it.',
    magnesium: 'Left out magnesium: you said you already take it.',
    'vitamin-c': 'Left out vitamin C: you said you already take it.',
    collagen: 'Left out collagen: you said you already take it.',
    protein: 'Left out protein: you said you already use it.',
    creatine: 'Left out creatine: you said you already take it.',
    'pre-workout': 'Left out a pre-workout: you said you already use one.',
  } as Record<string, string>,
  /** Stimulants, by the answer that ruled them out. */
  stimulant: {
    stimPreference: 'Left out anything with stimulants: you asked us to keep it stim-free.',
    caffeineLevel: 'Left out anything with stimulants: you said you avoid caffeine.',
  } as Record<string, string>,
  vegan: 'Left out anything that isn’t vegan: you said your diet is plant-based.',
  /** Neither quiz asks this today (answers.dietary is never set), so not shown yet. */
  glutenFree: 'Left out anything that isn’t gluten-free, as you asked.',
  collagenVeggie: 'Left out bovine collagen: you said you’re vegetarian or vegan.',
  /** A second product sharing an active ingredient was taken out. One line for all of them. */
  dedupActive: (actives: readonly string[]) =>
    actives.length === 1
      ? `Removed a doubled-up ingredient: ${actives[0]}.`
      : `Removed doubled-up ingredients: ${listJoin(actives)}.`,
  dedupActiveUnnamed: 'Removed a doubled-up ingredient.',
  /** The total of an active across the stack was held at its ceiling. */
  doseCap: (active: string, capMg: number) => `Kept ${active} to ${capMg} mg a day or less.`,
} as const

/** "a", "a and b", "a, b and c". */
function listJoin(items: readonly string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** Display names for the active ingredients the dedup and dose-cap rules name. */
export const ACTIVE_NAMES: Record<string, string> = {
  caffeine: 'caffeine',
  magnesium: 'magnesium',
  ashwagandha: 'ashwagandha',
  zinc: 'zinc',
  theanine: 'L-theanine',
  'l-theanine': 'L-theanine',
  'vitamin-c': 'vitamin C',
  'vitamin-d': 'vitamin D',
  'vitamin-b6': 'vitamin B6',
  'vitamin-b12': 'vitamin B12',
  'beta-alanine': 'beta-alanine',
  citrulline: 'citrulline',
  epa: 'EPA',
  dha: 'DHA',
  bcaa: 'BCAAs',
}

/**
 * An active's name as a customer reads it, or null when the stored name is
 * not fit to show (it carries a dose or a strain count, or is long), in which
 * case the unnamed line is used.
 */
export function activeDisplayName(raw: string): string | null {
  const key = raw.trim().toLowerCase()
  if (key === '') return null
  if (ACTIVE_NAMES[key]) return ACTIVE_NAMES[key]
  // "vitamin c" / "vitamin-d3" → "vitamin C" / "vitamin D3"
  const vitamin = key.match(/^vitamin[\s-]?([a-z]\d{0,2})$/)
  if (vitamin) return `vitamin ${vitamin[1].toUpperCase()}`
  if (/\d/.test(key) || key.length > 24) return null
  return key.replace(/-/g, ' ')
}
