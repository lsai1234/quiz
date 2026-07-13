/**
 * Selling-as-you-answer cues — the quiz doing the selling work as it's filled
 * in, drinks-forward in LQD mode.
 */
import { sellingCueFor } from '@/lib/quiz-sell'
import { defaultAnswers } from '@/lib/store'
import type { QuizAnswers } from '@/lib/types'

const a = (over: Partial<QuizAnswers> = {}): QuizAnswers => ({ ...defaultAnswers, ...over })

describe('sellingCueFor', () => {
  it('reacts to the goal just picked, drinks-first in LQD mode', () => {
    const stack = sellingCueFor('goals', a({ goals: ['muscle'] }), false)
    const lqd = sellingCueFor('goals', a({ goals: ['muscle'] }), true)
    expect(stack?.text).toMatch(/protein|creatine/i)
    expect(lqd?.text).toMatch(/shake|drink|no scooping/i)
    // The two modes are distinct cues (different ids), so switching re-shows.
    expect(lqd?.id).not.toBe(stack?.id)
  })

  it('keys the cue to the latest goal so each pick re-shows', () => {
    expect(sellingCueFor('goals', a({ goals: ['muscle', 'energy'] }), true)?.id).toContain('energy')
    expect(sellingCueFor('goals', a({ goals: ['muscle'] }), true)?.id).toContain('muscle')
  })

  it('says nothing until a value exists', () => {
    expect(sellingCueFor('goals', a({ goals: [] }), true)).toBeNull()
    expect(sellingCueFor('budget', a({ budget: null }), true)).toBeNull()
    expect(sellingCueFor('budget', a({ budget: '50-80' }), true)?.text).toMatch(/month|cancel|delivered/i)
  })

  it('the LQD pace step sells the no-daily-admin promise', () => {
    const cue = sellingCueFor('drinksPerDay', a({ drinksPerDay: 2, drinksMode: true }), true)
    expect(cue?.text).toMatch(/no daily admin|covered/i)
  })

  it('personal/review/type steps stay quiet (no cue defined)', () => {
    expect(sellingCueFor('personal', a(), true)).toBeNull()
    expect(sellingCueFor('review', a(), true)).toBeNull()
  })
})
