import type { AgeBracket, WeightBand } from '@/lib/types'
import { emptyInterview } from '../types'
import { setGoals, setTrack } from '../interview'
import { questionById } from '../bank'
import {
  BASIS_LINE, MEALS, dayComplete, mealsAnswered, nextMeal, proteinBasis,
  proteinComplete, proteinDoor, proteinDriverWeight, proteinGap, proteinIntake,
  proteinIntakeFrom, proteinProfile, proteinTarget, proteinVerdict, runningTotal,
  proteinHeard, verdictCopy, type ProteinTarget, type TargetBasis,
} from '../protein'

const BANDS: WeightBand[] = ['under-60', '60-75', '75-90', '90-105', '105-plus']
const BASES: TargetBasis[] = ['sedentary', 'active', 'lifting', 'deficit']

const target = (
  weightBand: WeightBand | null,
  basis: TargetBasis = 'lifting',
  ageBracket: AgeBracket | null = '35-44',
) => proteinTarget({ weightBand, ageBracket, basis })

const t = (lowG: number, highG: number): ProteinTarget => ({ lowG, highG, basis: 'lifting' })

describe('the target', () => {
  it('is null without a weight, rather than an average person', () => {
    // The number's whole value is that it is theirs. A fallback target would be
    // a made-up gap sold to someone who declined to give us the one input.
    expect(target(null)).toBeNull()
  })

  /**
   * The whole grid, pinned.
   *
   * The ranges behind this are a judgement call, so a change to them has to
   * show up as a diff a person can read rather than as a number that quietly
   * moved inside a helper.
   */
  it('is the full band × basis grid, as reviewed', () => {
    const grid: Record<string, string> = {}
    for (const band of BANDS) {
      for (const basis of BASES) {
        const r = target(band, basis)!
        grid[`${band} / ${basis}`] = `${r.lowG}–${r.highG}g`
      }
    }
    expect(grid).toEqual({
      'under-60 / sedentary': '45–55g',
      'under-60 / active': '65–90g',
      'under-60 / lifting': '90–120g',
      'under-60 / deficit': '100–120g',
      '60-75 / sedentary': '55–70g',
      '60-75 / active': '80–110g',
      '60-75 / lifting': '110–150g',
      '60-75 / deficit': '120–150g',
      '75-90 / sedentary': '65–80g',
      '75-90 / active': '100–130g',
      '75-90 / lifting': '130–180g',
      '75-90 / deficit': '150–180g',
      '90-105 / sedentary': '80–95g',
      '90-105 / active': '115–155g',
      '90-105 / lifting': '155–215g',
      '90-105 / deficit': '175–215g',
      '105-plus / sedentary': '90–110g',
      '105-plus / active': '135–180g',
      '105-plus / lifting': '180–245g',
      '105-plus / deficit': '200–245g',
    })
  })

  it('scales with the band midpoint', () => {
    const light = target('under-60', 'lifting')!
    const heavy = target('105-plus', 'lifting')!
    expect(heavy.lowG).toBeGreaterThan(light.lowG)
    // 55kg vs 112kg at the same g/kg — the ratio should track the midpoints.
    expect(heavy.lowG / light.lowG).toBeCloseTo(112 / 55, 1)
  })

  it('asks more of someone lifting than someone sedentary', () => {
    expect(target('75-90', 'lifting')!.lowG).toBeGreaterThan(target('75-90', 'sedentary')!.lowG)
    expect(target('75-90', 'active')!.lowG).toBeGreaterThan(target('75-90', 'sedentary')!.lowG)
  })

  it('raises the floor in a deficit but not the ceiling', () => {
    const lifting = target('75-90', 'lifting')!
    const deficit = target('75-90', 'deficit')!
    expect(deficit.lowG).toBeGreaterThan(lifting.lowG)
    expect(deficit.highG).toBe(lifting.highG)
  })

  describe('the 45+ nudge', () => {
    it('lifts the floor and leaves the ceiling alone', () => {
      const younger = target('75-90', 'lifting', '35-44')!
      const older = target('75-90', 'lifting', '45+')!
      expect(older.lowG).toBeGreaterThan(younger.lowG)
      expect(older.highG).toBe(younger.highG)
    })

    it('applies to no other band', () => {
      const base = target('75-90', 'lifting', '35-44')!
      for (const age of ['16-24', '25-34', '35-44'] as AgeBracket[]) {
        expect(target('75-90', 'lifting', age)).toEqual(base)
      }
    })

    it('never inverts the range', () => {
      // Today's numbers cannot, but a later edit to G_PER_KG could, and an
      // inverted range would render as "180–150g" without anything failing.
      for (const band of BANDS) {
        for (const basis of BASES) {
          const r = target(band, basis, '45+')!
          expect(r.lowG).toBeLessThanOrEqual(r.highG)
        }
      }
    })
  })

  it('rounds to 5g, because a banded input cannot justify more', () => {
    for (const band of BANDS) {
      for (const basis of BASES) {
        const r = target(band, basis)!
        expect(r.lowG % 5).toBe(0)
        expect(r.highG % 5).toBe(0)
      }
    }
  })
})

describe('the estimate', () => {
  const grams = (id: string) =>
    ({ 'b-eggs': 25, 'l-chicken': 35, 'd-fish': 40, 's-none': 0 } as Record<string, number>)[id]

  it('sums the grams behind the picks', () => {
    expect(proteinIntake(['b-eggs', 'l-chicken', 'd-fish', 's-none'], grams)).toBe(100)
  })

  it('totals a part-built day, for the running line', () => {
    expect(proteinIntake(['b-eggs'], grams)).toBe(25)
    expect(proteinIntake(['b-eggs', 'l-chicken'], grams)).toBe(60)
  })

  it('counts a zero rather than skipping it', () => {
    // "Nothing for breakfast" is an answer worth 0g, not a missing answer.
    expect(proteinIntake(['s-none'], grams)).toBe(0)
  })

  it('is null when nothing carries a number', () => {
    // "I honestly have no idea" gives a driver and no arithmetic. Null is what
    // stops the UI comparing it against a target.
    expect(proteinIntake(['no-idea'], grams)).toBeNull()
    expect(proteinIntake([], grams)).toBeNull()
  })

  it('knows when the day is finished', () => {
    expect(dayComplete(['breakfast', 'lunch', 'dinner'])).toBe(false)
    expect(dayComplete([...MEALS])).toBe(true)
  })
})

describe('the verdict', () => {
  // 130–180g, the 75–90kg lifter.
  const lifter = t(130, 180)

  it('measures against the floor, not the midpoint', () => {
    // Someone at the bottom of the range is not short, and calling them short
    // to sell them a tub is what would make the whole number untrustworthy.
    expect(proteinVerdict(lifter, 130)).toBe('on-target')
    expect(proteinGap(lifter, 130)).toBe(0)
  })

  it('calls a gap inside our own accuracy on-target', () => {
    // ±12g is the estimate's honest resolution, and the range came off a weight
    // band. "You are 8g short" is precision neither input supports.
    expect(proteinVerdict(lifter, 122)).toBe('on-target')
    expect(proteinVerdict(lifter, 118)).toBe('on-target')   // 12g short
  })

  it('names the boundaries exactly', () => {
    expect(proteinVerdict(lifter, 117)).toBe('small-gap')   // 13g short
    expect(proteinVerdict(lifter, 105)).toBe('small-gap')   // 25g — one shake
    expect(proteinVerdict(lifter, 104)).toBe('big-gap')     // 26g — past it
    expect(proteinVerdict(lifter, 180)).toBe('on-target')   // at the ceiling
    expect(proteinVerdict(lifter, 181)).toBe('over')
  })

  it('gives every band a reachable verdict', () => {
    for (const band of BANDS) {
      const r = target(band, 'lifting')!
      expect(proteinVerdict(r, r.lowG - 50)).toBe('big-gap')
      expect(proteinVerdict(r, r.lowG)).toBe('on-target')
      expect(proteinVerdict(r, r.highG + 20)).toBe('over')
    }
  })
})

describe('what reaches the engine', () => {
  const lifter = t(130, 180)

  it('scores nothing when they are on target or over', () => {
    // The "we'll leave protein out of your box" outcome has to reach the
    // engine, not just the copy.
    expect(proteinDriverWeight(lifter, 130)).toBe(0)
    expect(proteinDriverWeight(lifter, 200)).toBe(0)
  })

  it('confirms the driver on a real gap', () => {
    // The planner's CONFIRMED is 0.6 — a 30g gap should clear it.
    expect(proteinDriverWeight(lifter, 100)).toBeGreaterThanOrEqual(0.6)
  })

  it('draws the "worth a product" line at one shake', () => {
    // The threshold is SCOOP_G on purpose: below a scoop, there is nothing to
    // sell that would not be rounding error.
    expect(verdictCopy(lifter, 105).detail).not.toMatch(/shake/i)
    expect(verdictCopy(lifter, 104).detail).toMatch(/one shake/i)
  })

  it('scales with the size of the gap, and caps', () => {
    const small = proteinDriverWeight(lifter, 119)
    const big = proteinDriverWeight(lifter, 70)
    expect(big).toBeGreaterThan(small)
    expect(proteinDriverWeight(lifter, 0)).toBeLessThanOrEqual(1)
  })
})

describe('the words', () => {
  const lifter = t(130, 180)

  it('puts the estimate mark on every number the reader sees', () => {
    // Including the flattering ones. The `≈` is not decoration — it is the
    // difference between an estimate and a measurement.
    for (const intake of [70, 119, 130, 200]) {
      expect(verdictCopy(lifter, intake).headline).toContain('≈')
    }
    expect(runningTotal(60)).toBe('≈60g so far')
  })

  it('shows both ends of the target, never a single figure', () => {
    expect(verdictCopy(lifter, 100).headline).toBe('≈100g a day · target 130–180g')
  })

  it('hands out the target on its own, so nobody has to slice the headline', () => {
    // The screen animates the intake figure and composes the rest. Doing that
    // by cutting `headline` apart is how it first shipped "≈78gg a day".
    const copy = verdictCopy(lifter, 100)
    expect(copy.targetLabel).toBe('130–180g')
    expect(`≈100g a day · target ${copy.targetLabel}`).toBe(copy.headline)
  })

  it('never states a deficiency', () => {
    // §1.7. This module compares someone to a guideline; it does not find
    // anything, and one careless adjective is the difference.
    const banned = /deficien|deficit in|too low|unhealthy|poor|failing|at risk|malnour|you should be/i
    for (const intake of [0, 40, 70, 100, 117, 130, 155, 180, 200, 400]) {
      const copy = verdictCopy(lifter, intake)
      expect(`${copy.headline} ${copy.detail}`).not.toMatch(banned)
    }
    for (const line of Object.values(BASIS_LINE)) expect(line).not.toMatch(banned)
  })

  it('is proportionate — a small gap does not get big-gap language', () => {
    expect(verdictCopy(lifter, 117).detail).toMatch(/close/i)
    expect(verdictCopy(lifter, 117).detail).not.toMatch(/shake/i)
  })

  it('translates a real gap into something you can picture', () => {
    // 40g short of a 130g floor.
    expect(verdictCopy(lifter, 90).detail).toMatch(/shake/i)
  })

  it('does not round a gap up into more shakes than it is', () => {
    // A 40g gap is not two 25g shakes, and overstating the gap is overstating
    // what we are selling.
    expect(verdictCopy(lifter, 90).detail).toMatch(/a shake and a bit/i)
    expect(verdictCopy(lifter, 100).detail).not.toMatch(/two shakes/i)
    // 80g short is past the point where one product is the honest answer, and
    // the sentence has to say so rather than quoting a bigger number of tubs.
    expect(verdictCopy(lifter, 50).detail).toMatch(/spreading across meals/i)
  })

  it('puts the easy fix where their week actually is', () => {
    // "On the days you train" is useful to someone lifting and slightly silly
    // to someone who has told us they do not.
    const sedentary: ProteinTarget = { lowG: 65, highG: 80, basis: 'sedentary' }
    expect(verdictCopy(sedentary, 45).detail).toMatch(/lunch/i)
    expect(verdictCopy(sedentary, 45).detail).not.toMatch(/train/i)
    expect(verdictCopy(lifter, 117).detail).toMatch(/train/i)
  })

  it('is pleased rather than grudging when it costs us the sale', () => {
    // The most trust-building sentence in the quiz, and the reason the other
    // three verdicts are worth believing.
    const over = verdictCopy(lifter, 200)
    expect(over.detail).toMatch(/plenty/i)
    expect(over.detail).toMatch(/leave protein out/i)
    expect(over.tone).toBe('settled')
  })

  it('reads a gap as an opportunity and a match as settled', () => {
    expect(verdictCopy(lifter, 100).tone).toBe('opportunity')
    expect(verdictCopy(lifter, 117).tone).toBe('opportunity')
    expect(verdictCopy(lifter, 130).tone).toBe('settled')
  })

  it('says the gap back in the recap, in the user\u2019s own terms', () => {
    // Completes the same sentence `DRIVERS.heard` does, so it drops into the
    // existing recap in place of the generic "getting enough protein in is the
    // hard part" — which is a description of someone, where this is a fact.
    const line = proteinHeard(90, lifter)!
    expect(line).toContain('90g')
    expect(line).toContain('40g')
    expect(line).toMatch(/under the range for your size/)
    expect(line).not.toMatch(/deficien|too low|should/i)
  })

  it('has nothing to say in the recap when there is no gap', () => {
    expect(proteinHeard(150, lifter)).toBeNull()
    expect(proteinHeard(200, lifter)).toBeNull()
  })

  it('has a basis line for every situation, and none of them give the number away', () => {
    for (const basis of BASES) {
      const line = BASIS_LINE[basis]
      expect(line.length).toBeGreaterThan(0)
      // §2.2 — the hint says why we are asking, never what the answer is.
      expect(line).not.toMatch(/\d+\s*g\b/)
    }
  })
})

describe('reading it off the interview', () => {
  const withShape = (shape: string) => ({
    ...emptyInterview(10),
    picked: { 'training-shape': [shape] },
  })

  it('gives the top range to anyone lifting, however often', () => {
    expect(proteinBasis(withShape('lift-often'))).toBe('lifting')
    expect(proteinBasis(withShape('lift-few'))).toBe('lifting')
    expect(proteinBasis(withShape('mixed'))).toBe('lifting')
  })

  it('gives the middle range to training that is not lifting', () => {
    expect(proteinBasis(withShape('cardio'))).toBe('active')
    expect(proteinBasis(withShape('hiit-sport'))).toBe('active')
    expect(proteinBasis(withShape('light'))).toBe('active')
  })

  it('puts a cutting goal above everything else', () => {
    // Lifting while eating less is the highest requirement and the case most
    // likely to lose muscle getting it wrong. If the two rules disagreed
    // silently, the lower number is the one we would have quietly picked.
    const cutting = setGoals(withShape('lift-often'), ['cutting'])
    expect(proteinBasis(cutting)).toBe('deficit')
  })

  it('falls back to the goal before the training question has been asked', () => {
    const s = emptyInterview(10)
    expect(proteinBasis(setGoals(s, ['muscle']))).toBe('lifting')
    expect(proteinBasis(setGoals(s, ['recovery']))).toBe('active')
    expect(proteinBasis(setTrack(s, 'performance'))).toBe('active')
  })

  it('is sedentary only when nothing suggests otherwise', () => {
    expect(proteinBasis(setGoals(emptyInterview(10), ['sleep-better']))).toBe('sedentary')
    expect(proteinBasis(emptyInterview(10))).toBe('sedentary')
  })

  it('carries the weight and age straight through', () => {
    const s = {
      ...withShape('lift-often'),
      form: { name: '', ageBracket: '45+' as const, gender: null, weightBand: '90-105' as const },
    }
    expect(proteinProfile(s)).toEqual({ weightBand: '90-105', ageBracket: '45+', basis: 'lifting' })
    // …and end to end, the thing the screen actually shows.
    expect(proteinTarget(proteinProfile(s))).toEqual({ lowG: 175, highG: 215, basis: 'lifting' })
  })

  it('has no target for someone who skipped the weight question', () => {
    expect(proteinTarget(proteinProfile(withShape('lift-often')))).toBeNull()
  })
})

describe('the screen\u2019s answer, read off the bank', () => {
  const q = questionById('protein-check')!
  const opts = q.options
  const day = ['b-protein', 'l-protein', 'd-big', 's-one']

  it('knows which door an answer came through', () => {
    expect(proteinDoor(opts, [])).toBe('none')
    expect(proteinDoor(opts, ['day-normal'])).toBe('preset')
    expect(proteinDoor(opts, ['no-idea'])).toBe('no-idea')
    expect(proteinDoor(opts, ['b-protein'])).toBe('counted')
  })

  it('needs the whole day before a counted answer is finished', () => {
    // The presets are one tap; counting is four, and the target must not appear
    // until the fourth.
    expect(proteinComplete(opts, ['day-normal'])).toBe(true)
    expect(proteinComplete(opts, ['no-idea'])).toBe(true)
    expect(proteinComplete(opts, [])).toBe(false)
    expect(proteinComplete(opts, day.slice(0, 3))).toBe(false)
    expect(proteinComplete(opts, day)).toBe(true)
  })

  it('steps the beats in order, whatever order they were answered in', () => {
    expect(nextMeal(opts, [])).toBe('breakfast')
    expect(nextMeal(opts, ['b-protein'])).toBe('lunch')
    // A beat reopened from the summary is answered out of order; the walk must
    // still know the day is done.
    expect(nextMeal(opts, ['s-one', 'b-protein', 'd-big', 'l-protein'])).toBeNull()
    expect(mealsAnswered(opts, ['s-one', 'b-protein'])).toEqual(['breakfast', 'snacks'])
  })

  it('adds the day up', () => {
    expect(proteinIntakeFrom(opts, day)).toBe(25 + 35 + 65 + 22)
    expect(proteinIntakeFrom(opts, ['day-normal'])).toBe(75)
  })

  it('gives "no idea" no number to compare against anything', () => {
    expect(proteinIntakeFrom(opts, ['no-idea'])).toBeNull()
  })

  it('keeps the two doors telling the same story', () => {
    // The presets are the sums the counted path produces for the same
    // description. If they drifted apart, the same reader would get two
    // different numbers depending on which door they took.
    const quick = proteinIntakeFrom(opts, ['day-normal'])!
    const counted = proteinIntakeFrom(opts, ['b-carbs', 'l-light', 'd-protein', 's-light'])!
    expect(Math.abs(quick - counted)).toBeLessThanOrEqual(10)
  })

  it('has grams on every option that is not the honest shrug', () => {
    for (const o of opts) {
      if (o.id === 'no-idea') { expect(o.grams).toBeUndefined(); continue }
      expect(typeof o.grams).toBe('number')
    }
  })

  it('can reach every verdict — including the one that costs us the sale', () => {
    /*
     * The scale has to span the target, or a verdict is unreachable and nobody
     * finds out. It first shipped topping out at 170g: under the ceiling of an
     * 82kg lifter's 130–180g range, so "you're already over, we'll leave
     * protein out of your box" could not happen for anyone that size, and a
     * large person eating well would have been told they were short.
     */
    const min = MEALS.reduce((sum, m) =>
      sum + Math.min(...opts.filter((o) => o.meal === m).map((o) => o.grams ?? 0)), 0)
    const max = MEALS.reduce((sum, m) =>
      sum + Math.max(...opts.filter((o) => o.meal === m).map((o) => o.grams ?? 0)), 0)

    const lifter = proteinTarget({ weightBand: '75-90', ageBracket: '35-44', basis: 'lifting' })!
    expect(min).toBeLessThan(lifter.lowG)
    expect(max).toBeGreaterThan(lifter.highG)
    expect(proteinVerdict(lifter, min)).toBe('big-gap')
    expect(proteinVerdict(lifter, max)).toBe('over')
  })

  it('offers exactly four choices for each beat', () => {
    for (const m of MEALS) {
      expect(opts.filter((o) => o.meal === m)).toHaveLength(4)
    }
  })
})
