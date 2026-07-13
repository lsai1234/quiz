/**
 * The odd "did you know?" tidbits — sparse brand asides, drinks-forward in LQD
 * mode, shown on a few steps only (not per tap).
 */
import { quizFactFor } from '@/lib/quiz-sell'
import { QUIZ_STEPS, type StepId } from '@/lib/quiz-flow'

describe('quizFactFor', () => {
  it('only a few steps carry a fact — most say nothing', () => {
    const withFact = QUIZ_STEPS.map((s) => s.id).filter((id) => quizFactFor(id, true) || quizFactFor(id, false))
    // Sparse on purpose: an occasional aside, never every step.
    expect(withFact.length).toBeLessThanOrEqual(4)
    expect(quizFactFor('personal', true)).toBeNull()
    expect(quizFactFor('goals', true)).toBeNull()
    expect(quizFactFor('review', false)).toBeNull()
  })

  it('drinks mode leans into drinks & convenience; normal mode into the stack', () => {
    expect(quizFactFor('budget', true)?.text).toMatch(/box|month|pause|skip/i)
    expect(quizFactFor('budget', false)?.text).toMatch(/subscribe|bundle|rate/i)
    // The two modes are distinct facts (different ids) for the same step.
    expect(quizFactFor('budget', true)?.id).not.toBe(quizFactFor('budget', false)?.id)
  })

  it('the LQD pace step gets the one-box-in-the-fridge tidbit', () => {
    expect(quizFactFor('drinksPerDay', true)?.text).toMatch(/box|fridge|no tubs|no pills/i)
    // …and that step carries nothing in the normal stack quiz.
    expect(quizFactFor('drinksPerDay', false)).toBeNull()
  })

  it('a fact id is stable for a given step + mode (so it shows at most once)', () => {
    const a = quizFactFor('diet', true)
    const b = quizFactFor('diet', true)
    expect(a?.id).toBe(b?.id)
  })
})

// Type-only guard: every fact key is a real StepId.
const _stepIds: StepId[] = QUIZ_STEPS.map((s) => s.id)
void _stepIds
