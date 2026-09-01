import type { AgeBracket, WeightBand } from '@/lib/types'
// Type-only, so it compiles away: everything above the adapter at the bottom of
// this file is free of the quiz, and lifting the module out for a standalone
// calculator later means deleting two functions rather than untangling one.
import type { InterviewState } from './types'

/**
 * The protein check — all of the arithmetic, and all of the words.
 *
 * `docs/QUIZ_V2_PROTEIN.md` is the spec. The short version: the interview
 * already knows someone's weight band, training load, age and goals, so it can
 * work out roughly what they should be eating without asking anything new. Ask
 * what they actually eat, subtract, and the quiz can hand them a fact about
 * their own life rather than another description of themselves.
 *
 * ── Why the copy lives in here with the sums ────────────────────────────────
 * Because it is the part a person needs to read and disagree with. The ranges
 * below are a judgement call and so is the tone of `verdictCopy` — a sentence
 * that only exists inside JSX never gets reviewed, and the one thing this module
 * cannot afford is a line that reads as a diagnosis nobody looked at twice.
 *
 * ── Pure on purpose ─────────────────────────────────────────────────────────
 * No React, no `InterviewState`, no store. The inputs are a narrow struct the
 * caller assembles, so the same module can back a standalone calculator page
 * later without being untangled from the quiz first.
 */

// ─── What we need to know about someone ──────────────────────────────────────

/** Which range applies. Ordered loosely by how much protein it asks for. */
export type TargetBasis = 'sedentary' | 'active' | 'lifting' | 'deficit'

/**
 * The narrow input. Deliberately not `InterviewState`: everything here is a
 * plain value the quiz already holds, and keeping the dependency this small is
 * what lets the module be lifted out later.
 */
export interface ProteinProfile {
  weightBand: WeightBand | null
  ageBracket: AgeBracket | null
  basis: TargetBasis
}

export interface ProteinTarget {
  lowG: number
  highG: number
  basis: TargetBasis
}

export type Verdict = 'big-gap' | 'small-gap' | 'on-target' | 'over'

// ─── The target ──────────────────────────────────────────────────────────────

/**
 * Band midpoints, in kg.
 *
 * The top band is open-ended (`105kg+`) and the bottom nearly so. 112 and 55 are
 * deliberately conservative reads of those: a target that is a little low is a
 * gap that is a little small, which errs against our own commercial interest.
 * That is the right direction for every rounding decision in this file.
 */
const BAND_MIDPOINT_KG: Record<WeightBand, number> = {
  'under-60': 55,
  '60-75': 68,
  '75-90': 82,
  '90-105': 97,
  '105-plus': 112,
}

/**
 * Grams per kg per day.
 *
 * These are the commonly cited ranges, not a house view, and they are stated as
 * ranges because that is how the evidence behaves. `sedentary` is the standard
 * adult reference intake — worth remembering that it is a floor designed to
 * stop deficiency, not a target anybody is aiming at, which is exactly why the
 * copy never calls falling below it a deficiency.
 */
const G_PER_KG: Record<TargetBasis, { low: number; high: number }> = {
  sedentary: { low: 0.8, high: 1.0 },
  active: { low: 1.2, high: 1.6 },
  lifting: { low: 1.6, high: 2.2 },
  deficit: { low: 1.8, high: 2.2 },
}

/**
 * The nudge for the oldest band, applied to the floor only.
 *
 * The evidence for raising protein with age is really about 60+, and our top
 * band opens at 45 — so this is smaller than the literature would support for
 * a 70-year-old and larger than it would support for a 46-year-old. Lifting the
 * floor rather than the ceiling is the least-wrong thing to do with a band that
 * wide, and the copy never mentions age, because we cannot support a claim at
 * this resolution.
 */
const AGE_FLOOR_NUDGE_G_PER_KG = 0.2

/** Round to the nearest 5g. A banded input cannot justify a figure ending in 3. */
const round5 = (g: number): number => Math.round(g / 5) * 5

/**
 * The daily target, as a range.
 *
 * Null when weight is unknown — the caller asks for it or drops to the coarse
 * answer. It must never fall back to an average person, because the number's
 * entire value is that it is theirs.
 */
export function proteinTarget(profile: ProteinProfile): ProteinTarget | null {
  if (!profile.weightBand) return null

  const kg = BAND_MIDPOINT_KG[profile.weightBand]
  const range = G_PER_KG[profile.basis]
  const low = range.low + (profile.ageBracket === '45+' ? AGE_FLOOR_NUDGE_G_PER_KG : 0)

  return {
    // The nudge can in principle push the floor past the ceiling; it cannot
    // with today's numbers, but a later edit to the ranges should not be able
    // to produce an inverted range silently.
    lowG: round5(Math.min(low, range.high) * kg),
    highG: round5(range.high * kg),
    basis: profile.basis,
  }
}

// ─── What they actually eat ──────────────────────────────────────────────────

/** The four beats of the counted path, in order. */
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const
export type Meal = (typeof MEALS)[number]

/**
 * Sum the grams behind a set of picks.
 *
 * Takes a lookup rather than reaching into the question bank, so the maths can
 * be tested without a bank and the bank stays the single place option ids are
 * declared.
 *
 * Returns null when nothing is known — "I honestly have no idea" contributes a
 * driver but not a number, and null is what stops the UI comparing it to a
 * target.
 */
export function proteinIntake(
  picked: readonly string[],
  gramsFor: (optionId: string) => number | undefined,
): number | null {
  let total: number | null = null
  for (const id of picked) {
    const g = gramsFor(id)
    if (typeof g !== 'number' || !Number.isFinite(g)) continue
    total = (total ?? 0) + g
  }
  return total
}

/** Whether every beat has been answered — the gate on showing the target (§2.4). */
export const dayComplete = (answered: readonly Meal[]): boolean =>
  MEALS.every((m) => answered.includes(m))

// ─── The comparison ──────────────────────────────────────────────────────────

/**
 * The estimate's own honest resolution, and therefore the point below which a
 * gap is not a gap.
 *
 * Door C is roughly ±12g (§1.4). Telling someone they are 8g short of a range
 * derived from a weight *band* is precision neither input supports, and it
 * would be precision invented in our own favour.
 */
const ESTIMATE_ACCURACY_G = 12

/** A shake is ~25g, and it is the unit the reader can actually picture. */
const SCOOP_G = 25

/**
 * Over this, protein leads the stack — and it is one shake, deliberately.
 *
 * The question a threshold here is really answering is *"is this gap worth a
 * product at all?"*, and a scoop is exactly that line. Picking a round 30
 * instead would make the copy award a shake to a gap smaller than a shake at
 * one end, and call a 30g hole "close" at the other.
 */
const BIG_GAP_G = SCOOP_G

/**
 * Where they land against the range.
 *
 * Measured against the **floor**, not the midpoint: someone at the bottom of a
 * 120–140g range is not short, and calling them short to sell them a tub is the
 * exact behaviour that would make the whole number untrustworthy.
 */
export function proteinVerdict(target: ProteinTarget, intakeG: number): Verdict {
  if (intakeG > target.highG) return 'over'
  if (intakeG >= target.lowG) return 'on-target'
  const gap = target.lowG - intakeG
  if (gap > BIG_GAP_G) return 'big-gap'
  if (gap > ESTIMATE_ACCURACY_G) return 'small-gap'
  return 'on-target'
}

/** The gap to close, in grams. Zero once they are at or above the floor. */
export const proteinGap = (target: ProteinTarget, intakeG: number): number =>
  Math.max(0, target.lowG - intakeG)

/**
 * How much of the driver the gap justifies.
 *
 * The point of the whole module: `low-protein` used to arrive from a coarse
 * self-report, and now arrives from a subtraction. `over` and `on-target`
 * return 0 so the caller clears the driver rather than scoring it — which is
 * how the "we'll leave protein out of your box" outcome actually reaches the
 * engine instead of only reaching the copy.
 */
export function proteinDriverWeight(target: ProteinTarget, intakeG: number): number {
  const verdict = proteinVerdict(target, intakeG)
  if (verdict === 'over' || verdict === 'on-target') return 0
  const gap = proteinGap(target, intakeG)
  // 30g short is confirmed (the planner's CONFIRMED is 0.6); scales to 1 at 60g.
  return Math.min(1, Math.round((0.3 + (gap / 60) * 0.7) * 100) / 100)
}

// ─── The words ───────────────────────────────────────────────────────────────

/**
 * The hint line: what we already know, and not what it adds up to.
 *
 * Showing the target before the estimate would anchor the self-report it is
 * about to be compared against (§2.2). These say why the question is being
 * asked, prove the quiz was listening, and hand over nothing to aim at.
 */
export const BASIS_LINE: Record<TargetBasis, string> = {
  lifting: 'You lift — that moves this number more than most people expect.',
  deficit: 'You’re eating less to lose weight, which changes this more than it looks.',
  active: 'You’re active most weeks, and that shifts what you need.',
  sedentary: 'Worth a look even if you’re not training — most people are under.',
}

export interface VerdictCopy {
  /** The comparison line, already assembled. Always carries `≈`. */
  headline: string
  /**
   * The target on its own, so a caller animating the intake figure can compose
   * the line rather than slicing `headline` apart — which is how the screen
   * first shipped "≈78gg a day".
   */
  targetLabel: string
  /** The translation. A gram figure on its own means nothing to most readers. */
  detail: string
  /** Whether the accent (an opportunity) or the neutral (nothing to fix) tone. */
  tone: 'opportunity' | 'settled'
}

/**
 * What the strip says.
 *
 * Rules this copy is written against, all from §1.7 and §2.6:
 *  • no deficiency language — "short of", never "low", "deficient", "poor"
 *  • the `≈` is on every number, including the flattering ones
 *  • proportionate — overselling a 15g gap loses the reader who can do sums
 *  • the `over` case is pleased rather than grudging. It costs us a line item
 *    and it is the only reason the other three are worth believing.
 */
export function verdictCopy(target: ProteinTarget, intakeG: number): VerdictCopy {
  const targetLabel = `${target.lowG}–${target.highG}g`
  const headline = `≈${intakeG}g a day · target ${targetLabel}`
  const verdict = proteinVerdict(target, intakeG)
  const gap = proteinGap(target, intakeG)

  switch (verdict) {
    case 'big-gap': {
      /*
       * Rounded to the nearest half shake, in words.
       *
       * "About two shakes" for a 40g gap overstates it by a quarter, and
       * overstating the gap is overstating what we are selling. The half-step
       * costs one branch and keeps every version of this sentence true.
       *
       * Past ~2.5 shakes the honest answer stops being a product at all, and
       * the sentence says so.
       */
      const shakes = gap / SCOOP_G
      const inShakes = shakes < 1.25 ? 'roughly one shake a day'
        : shakes < 1.75 ? 'about a shake and a bit'
        : shakes < 2.5 ? 'about two shakes'
        : 'enough that it wants spreading across meals, not added in one go'
      return {
        headline, targetLabel,
        detail: `About ${round5(gap)}g short of the range — ${inShakes}.`,
        tone: 'opportunity',
      }
    }
    case 'small-gap':
      return {
        headline, targetLabel,
        // Where the easy fix is depends on the week they described. "On the
        // days you train" is a useful sentence to someone lifting and a
        // slightly silly one to someone who told us they do not.
        detail: `About ${round5(gap)}g short — close. ${
          target.basis === 'sedentary'
            ? 'One better lunch most days would cover it.'
            : 'Easiest to close on the days you train.'
        }`,
        tone: 'opportunity',
      }
    case 'on-target':
      return {
        headline, targetLabel,
        detail: 'That’s on the money — nothing to fix here.',
        tone: 'settled',
      }
    case 'over':
      return {
        headline, targetLabel,
        detail: 'That’s plenty. We’ll leave protein out of your box.',
        tone: 'settled',
      }
  }
}

/**
 * The recap line — the left half of a "what you told us" row.
 *
 * Written to complete the same sentence `DRIVERS.heard` does, so it drops
 * straight into the existing recap in place of the generic "getting enough
 * protein in is the hard part". Same rule as every other string here: an
 * observation about someone's week, never a finding about their health.
 *
 * Null when there is no gap worth naming — the recap only ever lists drivers
 * that survived, so this is belt and braces rather than a live path.
 */
export function proteinHeard(intakeG: number, target: ProteinTarget): string | null {
  const gap = proteinGap(target, intakeG)
  if (gap <= 0) return null
  return `you are eating around ${intakeG}g of protein a day, about ${round5(gap)}g under the range for your size`
}

/** The running total, before the day is complete. Never compared to anything. */
export const runningTotal = (intakeG: number): string => `≈${intakeG}g so far`

// ─── The join to the interview ───────────────────────────────────────────────

/* Everything above this line is free of the quiz — see the import note. */

/** Weights, more than twice a week — the only shape that earns the top range. */
const LIFTING_SHAPES = ['lift-often', 'lift-few', 'mixed']
/** Training of some kind, but not the barbell volume the 1.6+ range is about. */
const ACTIVE_SHAPES = ['cardio', 'hiit-sport', 'light']

/**
 * Which range applies to this person.
 *
 * Ordered deliberately. `deficit` wins over `lifting` because someone lifting
 * while eating less is the case with the highest requirement and the one most
 * likely to lose muscle getting it wrong — and because if the two disagreed
 * silently, the lower number is the one we would have quietly picked.
 */
export function proteinBasis(state: InterviewState): TargetBasis {
  const shape = state.picked['training-shape'] ?? []
  const lifts = shape.some((id) => LIFTING_SHAPES.includes(id))
  const active = shape.some((id) => ACTIVE_SHAPES.includes(id))

  if (state.goals.includes('cutting')) return 'deficit'
  if (lifts) return 'lifting'
  if (active) return 'active'
  // No training answer yet. A muscle-shaped goal is enough to say they are not
  // sedentary; anything else is, until they tell us otherwise.
  if (state.goals.some((g) => ['muscle', 'bulking', 'performance'].includes(g))) return 'lifting'
  if (state.track === 'performance' || state.goals.includes('recovery')) return 'active'
  return 'sedentary'
}

/** The narrow input, assembled from what the interview already holds. */
export const proteinProfile = (state: InterviewState): ProteinProfile => ({
  weightBand: state.form.weightBand,
  ageBracket: state.form.ageBracket,
  basis: proteinBasis(state),
})

// ─── Reading an answer off the question ──────────────────────────────────────

/*
 * The bank is the single place option ids and their grams are declared, so
 * everything below takes the question and derives rather than duplicating a
 * table. Which door was taken is derived too — one `picked` array, no extra
 * state, and so `rewindTo` and `reviseAnswer` keep working untouched.
 */

/** Which door an answer came through. */
export type ProteinDoor = 'none' | 'preset' | 'counted' | 'no-idea'

interface OptionLike {
  id: string
  grams?: number
  meal?: Meal
}

const byId = (options: readonly OptionLike[], id: string) => options.find((o) => o.id === id)

export function proteinDoor(options: readonly OptionLike[], picked: readonly string[]): ProteinDoor {
  if (picked.length === 0) return 'none'
  if (picked.some((id) => byId(options, id)?.meal)) return 'counted'
  if (picked.some((id) => typeof byId(options, id)?.grams === 'number')) return 'preset'
  return 'no-idea'
}

/** The beats already answered, in the canonical order. */
export const mealsAnswered = (
  options: readonly OptionLike[],
  picked: readonly string[],
): Meal[] => MEALS.filter((m) => picked.some((id) => byId(options, id)?.meal === m))

/** The next beat to put, or null once the day is done. */
export const nextMeal = (
  options: readonly OptionLike[],
  picked: readonly string[],
): Meal | null => MEALS.find((m) => !mealsAnswered(options, picked).includes(m)) ?? null

/** Enough of an answer to continue on. */
export function proteinComplete(
  options: readonly OptionLike[],
  picked: readonly string[],
): boolean {
  const door = proteinDoor(options, picked)
  if (door === 'preset' || door === 'no-idea') return true
  if (door === 'counted') return dayComplete(mealsAnswered(options, picked))
  return false
}

/** The estimate behind an answer. Null for "no idea", and for a part-built day. */
export function proteinIntakeFrom(
  options: readonly OptionLike[],
  picked: readonly string[],
): number | null {
  return proteinIntake(picked, (id) => byId(options, id)?.grams)
}
