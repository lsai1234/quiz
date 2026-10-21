import { buildBlueprintPrompt, BLUEPRINT_SYSTEM_PROMPT } from '../ai-stack'
import { defaultAnswers } from '../quiz-answers'
import type { QuizAnswers } from '../types'

/**
 * What the personaliser is told, and what it is asked to send back.
 *
 * The quiz asks for no budget, so the prompt used to fill one in from a
 * default ("£50–80/month", never to be exceeded). And the model used to write
 * each slot's customer-facing reason. Both are gone: it gets the person and the
 * options, and answers with product ids.
 */

const slots = [{
  slotId: 'slot-health', title: 'Daily Health', description: 'Foundation',
  currentProductId: 'a',
  options: [{ id: 'a', name: 'A', category: 'Health', price: 20, reason: 'r', claims: [], vegan: true, stimulant: false }],
}] as unknown as Parameters<typeof buildBlueprintPrompt>[1]

const answers = (over: Partial<QuizAnswers> = {}): QuizAnswers =>
  ({ ...defaultAnswers, goals: ['energy'], ...over })

describe('the personaliser prompt states no budget', () => {
  it('sends none when the quiz asked for none', () => {
    const prompt = buildBlueprintPrompt(answers({ budget: null }), slots)
    expect(prompt).not.toMatch(/budget/i)
    expect(prompt).not.toMatch(/£50/)
    expect(prompt).not.toMatch(/never exceed/i)
  })

  it('sends none for an old answer set that carries one — the cap is enforced in code', () => {
    for (const budget of ['under-30', '30-50', '50-80', '80-plus'] as const) {
      const prompt = buildBlueprintPrompt(answers({ budget }), slots)
      expect(prompt).not.toMatch(/budget/i)
      expect(prompt).not.toMatch(/£\d+(–\d+)?\+?\/month/)
    }
  })

  it('sends no stack preference', () => {
    const prompt = buildBlueprintPrompt(answers({ stackPreference: 'balanced' }), slots)
    expect(prompt).not.toMatch(/preference: balanced/i)
    expect(prompt).not.toMatch(/stack preference/i)
  })

  it('tells the model there is no budget to fill', () => {
    expect(BLUEPRINT_SYSTEM_PROMPT).toMatch(/no budget to aim for or to fill/)
    expect(BLUEPRINT_SYSTEM_PROMPT).not.toMatch(/BUDGET RULE|never exceed/i)
  })

  it('still offers every option with its id, so the model can choose', () => {
    const prompt = buildBlueprintPrompt(answers(), slots)
    expect(prompt).toContain('Slot "slot-health"')
    expect(prompt).toContain('- a | A | Health')
  })
})

describe('the personaliser writes no customer text', () => {
  it('asks for product ids only', () => {
    expect(BLUEPRINT_SYSTEM_PROMPT).toContain('{"choices":{"slotId":"productId", ...}}')
    expect(BLUEPRINT_SYSTEM_PROMPT).not.toMatch(/"reasons"/)
  })

  it('does not cast the model as a copywriter or ask it to sell', () => {
    expect(BLUEPRINT_SYSTEM_PROMPT).not.toMatch(/copywriter|sales copy that|sell them/i)
    expect(BLUEPRINT_SYSTEM_PROMPT).toMatch(/Do not write reasons/)
  })

  it('does not ask for reasons in the user prompt either', () => {
    const prompt = buildBlueprintPrompt(
      answers({ dynamicAnswers: { q1: { optionId: 'x', question: 'When?', answer: 'Afternoon', signals: [] } } }),
      slots,
    )
    expect(prompt).not.toMatch(/reasons? specific|write/i)
  })
})
