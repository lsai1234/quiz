/**
 * The odd "did you know?" tidbits — sparse brand asides, shown on a few steps
 * only (not per tap).
 */
import { quizFactFor } from '@/lib/quiz-sell'
import { QUIZ_STEPS, type StepId } from '@/lib/quiz-flow'

describe('quizFactFor', () => {
  it('only a few steps carry a fact — most say nothing', () => {
    const ids = QUIZ_STEPS.map((s) => s.id)
    // Sparse on purpose: an occasional aside, never every step.
    expect(ids.filter((id) => quizFactFor(id)).length).toBeLessThanOrEqual(3)
    expect(quizFactFor('personal')).toBeNull()
    expect(quizFactFor('goals')).toBeNull()
    expect(quizFactFor('review')).toBeNull()
  })

  it('`supps` carries its own line and the subscribe-&-save one', () => {
    // Budget and formats are both gone as steps, so `supps` — the last step
    // before review — took the subscribe-&-save line the formats step held.
    expect(quizFactFor('supps')?.text).toMatch(/subscribe|bundle|rate/i)
    expect(quizFactFor('supps')?.text).toMatch(/already take|gaps/i)
  })

  it('a fact id is stable for a given step (so it shows at most once)', () => {
    const a = quizFactFor('diet')
    const b = quizFactFor('diet')
    expect(a?.id).toBe(b?.id)
  })
})

// Type-only guard: every fact key is a real StepId.
const _stepIds: StepId[] = QUIZ_STEPS.map((s) => s.id)
void _stepIds
