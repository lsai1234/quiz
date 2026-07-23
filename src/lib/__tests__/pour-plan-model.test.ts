import { defaultAnswers } from '@/lib/store'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { QuizAnswers } from '@/lib/types'

/**
 * Pour Plan — Phase 1 (data model). These assertions lock the additive shape:
 * the new consumption rhythm + quiz fields exist and default safely, with no
 * behaviour change to anything else (guarded by the rest of the suite).
 */
describe('Pour Plan data model (P1)', () => {
  it('the consumption model accepts the as-needed rhythm + tags', () => {
    const product: Partial<CatalogueProduct> = {
      defaultVariantId: 'v-berry',
      consumption: {
        cadence: 'as-needed',
        servingsPerUnit: 30,
        daysPerWeek: 4,
        asNeededTrigger: 'sweat',
        anchor: 'hot-days',
      },
    }
    expect(product.consumption?.cadence).toBe('as-needed')
    expect(product.consumption?.asNeededTrigger).toBe('sweat')
    expect(product.defaultVariantId).toBe('v-berry')
  })

  it('quiz answers carry primaryGoal + asNeeded and default safely', () => {
    expect(defaultAnswers.primaryGoal).toBeNull()
    expect(defaultAnswers.asNeeded).toEqual({})

    const answers: QuizAnswers = {
      ...defaultAnswers,
      primaryGoal: 'energy',
      asNeeded: { sweat: 'often', sleep: 'sometimes' },
    }
    expect(answers.primaryGoal).toBe('energy')
    expect(answers.asNeeded?.sweat).toBe('often')
  })
})
