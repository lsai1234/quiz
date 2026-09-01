import { buildBlueprintPrompt } from '../ai-stack'
import { defaultAnswers } from '../quiz-answers'
import { DRIVERS } from '../quiz-v2/drivers'
import type { QuizAnswers } from '../types'

/**
 * The DEEPER CONTEXT block, on both arms.
 *
 * It exists to carry WHY this person is low on energy — the thing the flat
 * profile cannot. v1 fills it from the deep-dive follow-ups. v2 has no
 * deep-dive step, because its whole run is root-cause questions, so the block
 * came through EMPTY on the arm that knows most about the person. The
 * personaliser was working from less, having been told more.
 */

const slots = [{
  slotId: 'slot-health', title: 'Daily Health', description: 'Foundation',
  currentProductId: 'a',
  options: [{ id: 'a', name: 'A', category: 'Health', price: 20, reason: 'r', claims: [], vegan: true, stimulant: false }],
}] as unknown as Parameters<typeof buildBlueprintPrompt>[1]

const answers = (over: Partial<QuizAnswers> = {}): QuizAnswers =>
  ({ ...defaultAnswers, goals: ['energy'], ...over })

describe('the deeper-context block', () => {
  it('is absent when there is nothing to say', () => {
    expect(buildBlueprintPrompt(answers(), slots)).not.toContain('DEEPER CONTEXT')
  })

  it('carries v1 deep-dive answers, as it always did', () => {
    const prompt = buildBlueprintPrompt(
      answers({
        dynamicAnswers: {
          q1: { optionId: 'afternoon', question: 'When does it hit?', answer: 'Mid-afternoon', signals: [] },
        },
      }),
      slots,
    )
    expect(prompt).toContain('DEEPER CONTEXT')
    expect(prompt).toContain('Mid-afternoon')
  })

  it('carries v2 drivers, which used to reach it as nothing at all', () => {
    const prompt = buildBlueprintPrompt(
      answers({ drivers: { 'sleep-debt': 0.8, 'caffeine-crash': 0.5 } }),
      slots,
    )
    expect(prompt).toContain('DEEPER CONTEXT')
    expect(prompt).toContain(DRIVERS['sleep-debt'].heard)
    expect(prompt).toContain(DRIVERS['caffeine-crash'].heard)
  })

  it('leads with the strongest one', () => {
    const prompt = buildBlueprintPrompt(
      answers({ drivers: { 'caffeine-crash': 0.3, 'sleep-debt': 0.9 } }),
      slots,
    )
    expect(prompt.indexOf(DRIVERS['sleep-debt'].heard))
      .toBeLessThan(prompt.indexOf(DRIVERS['caffeine-crash'].heard))
  })

  it('drops a driver that is only a hint from half an answer', () => {
    const prompt = buildBlueprintPrompt(answers({ drivers: { 'sleep-debt': 0.1 } }), slots)
    expect(prompt).not.toContain('DEEPER CONTEXT')
  })

  it('sends no confidence figures — a decimal reads as precision this has not got', () => {
    const prompt = buildBlueprintPrompt(answers({ drivers: { 'sleep-debt': 0.8 } }), slots)
    expect(prompt).not.toMatch(/sleep-debt/)
    expect(prompt).not.toMatch(/0\.8/)
  })

  it('ignores a driver id nothing recognises', () => {
    const prompt = buildBlueprintPrompt(
      answers({ drivers: { 'not-a-driver': 0.9 } as never }),
      slots,
    )
    expect(prompt).not.toContain('DEEPER CONTEXT')
  })
})
