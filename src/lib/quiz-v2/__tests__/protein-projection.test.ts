import { emptyInterview, type InterviewState } from '../types'
import { answerQuestion, setGoals, setForm, setTrack } from '../interview'
import { questionById } from '../bank'
import { projectAnswers } from '../project'
import { NOTED } from '../drivers'
import type { WeightBand } from '@/lib/types'

/**
 * What the protein check hands the recommendation engine.
 *
 * The interesting assertions here are the two that cost us something: the
 * driver going to zero rather than to a small number when someone is on target,
 * and the whole thing staying absent when there is nothing honest to say.
 */

const Q = questionById('protein-check')!

function run(picks: string[], weightBand: WeightBand | null = '75-90') {
  let s: InterviewState = emptyInterview(10)
  s = setTrack(s, 'performance')
  s = setGoals(s, ['muscle'])
  s = setForm(s, { ageBracket: '35-44', weightBand })
  for (const id of ['goals', 'safety', 'personal']) s = answerQuestion(s, questionById(id)!, [])
  // A lifter: 82kg midpoint at 1.6–2.2 g/kg → 130–180g.
  s = answerQuestion(s, questionById('training-shape')!, ['lift-often'])
  s = answerQuestion(s, Q, picks)
  return projectAnswers(s)
}

describe('the numbers reaching the engine', () => {
  it('carries the estimate and both ends of the target', () => {
    const a = run(['day-normal'])
    expect(a.proteinIntakeG).toBe(75)
    expect(a.proteinTargetG).toBe(130)
    expect(a.proteinTargetHighG).toBe(180)
  })

  it('replaces the option’s guess with the subtraction', () => {
    // `day-normal` carries a static 0.45 for the planner. Once there is a
    // target, the measured gap is strictly better information and the guess
    // must not survive alongside it.
    const a = run(['day-normal'])
    expect(a.drivers?.['low-protein']).toBeGreaterThan(0.45)
  })

  it('clears the driver entirely when they are on target', () => {
    // The one that costs us a line item. The option's own weight would still be
    // sitting there quietly selling a tub to someone the screen had just
    // congratulated.
    const a = run(['day-high']) // 145g, inside 130–180
    expect(a.proteinIntakeG).toBe(145)
    expect(a.drivers?.['low-protein']).toBeUndefined()
  })

  it('clears it when they are over, too', () => {
    const a = run(['b-shake', 'l-big', 'd-big', 's-many']) // 25+55+65+50 = 195
    expect(a.proteinIntakeG).toBe(195)
    expect(a.drivers?.['low-protein']).toBeUndefined()
  })

  it('scales the driver with the size of the gap', () => {
    const small = run(['day-decent'])!.drivers?.['low-protein'] ?? 0  // 105 → 25g short
    const big = run(['day-light'])!.drivers?.['low-protein'] ?? 0     // 55 → 75g short
    expect(big).toBeGreaterThan(small)
    expect(small).toBeGreaterThanOrEqual(NOTED)
  })

  describe('when there is nothing honest to say', () => {
    it('claims no number for "I honestly have no idea"', () => {
      const a = run(['no-idea'])
      expect(a.proteinIntakeG).toBeUndefined()
      expect(a.proteinTargetG).toBeUndefined()
      // …and the coarse evidence stands, because it is all we have: 0.5 from
      // the option plus 0.3 from "weights, 4+ times a week".
      expect(a.drivers?.['low-protein']).toBeCloseTo(0.8)
    })

    it('claims no number without a weight to build a target from', () => {
      const a = run(['day-normal'], null)
      expect(a.proteinIntakeG).toBeUndefined()
      expect(a.proteinTargetHighG).toBeUndefined()
      // The accumulated guess is the fallback, unrefined by any subtraction.
      expect(a.drivers?.['low-protein']).toBeCloseTo(0.75)
    })

    it('claims no number for a day that was never finished', () => {
      const a = run(['b-protein', 'l-protein'])
      expect(a.proteinIntakeG).toBeUndefined()
    })

    it('says nothing at all when the screen was never asked', () => {
      let s = emptyInterview(10)
      s = setTrack(s, 'performance')
      s = setGoals(s, ['muscle'])
      const a = projectAnswers(s)
      expect(a.proteinIntakeG).toBeUndefined()
      expect(a.proteinTargetG).toBeUndefined()
      expect(a.proteinTargetHighG).toBeUndefined()
    })
  })
})
