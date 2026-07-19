/**
 * The odd "did you know?" tidbits — sparse brand asides, drinks-forward in LQD
 * mode, shown on a few steps only (not per tap).
 */
import { quizFactFor } from '@/lib/quiz-sell'
import { QUIZ_STEPS, type StepId } from '@/lib/quiz-flow'

describe('quizFactFor', () => {
  it('only a few steps carry a fact — most say nothing', () => {
    const ids = QUIZ_STEPS.map((s) => s.id)
    // Sparse on purpose, per mode: an occasional aside, never every step.
    expect(ids.filter((id) => quizFactFor(id, true)).length).toBeLessThanOrEqual(3)
    expect(ids.filter((id) => quizFactFor(id, false)).length).toBeLessThanOrEqual(3)
    expect(quizFactFor('personal', true)).toBeNull()
    expect(quizFactFor('goals', true)).toBeNull()
    expect(quizFactFor('review', false)).toBeNull()
  })

  it('drinks mode leans into drinks & convenience; normal mode into the stack', () => {
    // LQD skips the budget step, so its ships-monthly fact lives on trainingTime.
    expect(quizFactFor('trainingTime', true)?.text).toMatch(/box|month|pause|skip/i)
    expect(quizFactFor('budget', false)?.text).toMatch(/subscribe|bundle|rate/i)
    // The budget fact is stack-mode only now.
    expect(quizFactFor('budget', true)).toBeNull()
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
