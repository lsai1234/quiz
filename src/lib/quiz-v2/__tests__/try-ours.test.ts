import { emptyInterview } from '../types'
import { answerQuestion, setGoals, setTrack, setTryOurs } from '../interview'
import { projectAnswers } from '../project'
import { questionById } from '../bank'
import { scoreProduct, getArchetype } from '@/lib/stack-blueprint/factory'
import { MOCK_CATALOGUE } from '@/lib/catalogue'

/**
 * "Keep yours, or try ours?" — v1's supps follow-up, ported to v2.
 *
 * Not cosmetic. Ticking something on the supps screen HARD-EXCLUDES that whole
 * swap group in `scoreProduct`, so without the follow-up a v2 member who takes
 * a supermarket multivitamin had no way back into the box for ours, however
 * well it fitted. v1 has had the escape hatch since launch; v2 shipped without
 * one and nobody could tell, because the missing product looks exactly like a
 * product that was never a good fit.
 */

const Q = (id: string) => questionById(id)!

const seeded = () => setGoals(setTrack(emptyInterview(10), 'wellbeing'), ['health'])

describe('keep yours, or try ours', () => {
  it('excludes what they already take, by default', () => {
    let s = seeded()
    s = answerQuestion(s, Q('supps'), ['multivitamin'])
    const answers = projectAnswers(s)
    expect(answers.currentVitamins).toContain('multivitamin')
    expect(answers.tryOurs ?? []).toEqual([])

    const multi = MOCK_CATALOGUE.find((p) => p.swapGroup === 'multivitamin')!
    expect(scoreProduct(multi, 'health', answers, getArchetype(answers.goals))).toBe(-Infinity)
  })

  it('lets them ask for ours anyway, and the engine honours it', () => {
    let s = seeded()
    s = answerQuestion(s, Q('supps'), ['multivitamin'])
    s = setTryOurs(s, ['multivitamin'], ['multivitamin'])
    const answers = projectAnswers(s)
    expect(answers.tryOurs).toEqual(['multivitamin'])

    const multi = MOCK_CATALOGUE.find((p) => p.swapGroup === 'multivitamin')!
    expect(scoreProduct(multi, 'health', answers, getArchetype(answers.goals))).toBeGreaterThan(-Infinity)
  })

  it('drops a preference for something they never said they take', () => {
    // The setter prunes on write and the projection prunes again, because the
    // two go stale in different ways: the first when they untick on the screen,
    // the second when an EDIT from the review rewrites the answer underneath a
    // preference that was set before it.
    let s = seeded()
    s = answerQuestion(s, Q('supps'), ['multivitamin'])
    s = setTryOurs(s, ['multivitamin'], ['multivitamin'])
    // They go back and change the answer — no multivitamin any more.
    s = answerQuestion(s, Q('supps'), ['creatine'])
    expect(projectAnswers(s).tryOurs).toEqual([])
  })

  it('refuses an id that was never on offer', () => {
    const s = setTryOurs(seeded(), ['something-else'], ['multivitamin'])
    expect(s.tryOurs).toEqual([])
  })

  it('changes nothing at all when it is left alone', () => {
    let s = seeded()
    s = answerQuestion(s, Q('supps'), ['multivitamin', 'omega-3'])
    expect(projectAnswers(s).tryOurs).toEqual([])
  })
})
