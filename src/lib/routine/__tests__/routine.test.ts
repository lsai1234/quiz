import { anchorOf, dayFromQuiz, defaultDay, minutesFor, normaliseDay, routineFor, type RoutineProduct } from '..'
import { ROUTINE_COPY } from '../copy'
import { MOCK_CATALOGUE } from '@/lib/catalogue'

const product = (id: string, consumption: RoutineProduct['consumption'], stackSlots: RoutineProduct['stackSlots'] = ['health']): RoutineProduct => ({
  id, title: `CHRGD ${id}`, shortName: id, consumption, stackSlots,
})

describe('your day: each product at its "Best taken" moment, on their own day', () => {
  const day = { wake: 6 * 60 + 30, bed: 22 * 60 + 30, trainAt: 18 * 60, trainDays: 3, trainWeekdays: [0, 2, 4], assumed: false }

  it('places moments around their wake, bed and training times', () => {
    expect(minutesFor('morning', day)).toBe(7 * 60)
    expect(minutesFor('wind-down', day)).toBe(21 * 60 + 30)
    expect(minutesFor('pre-workout', day)).toBe(17 * 60 + 30)
    expect(minutesFor('post-workout', day)).toBe(19 * 60 + 15)
    expect(minutesFor('evening', day)).toBe(18 * 60 + 30)
    expect(minutesFor('hot-days', day)).toBeNull()
    // Unknown training time: training products have no time on the clock.
    expect(minutesFor('pre-workout', { ...day, trainAt: null })).toBeNull()
  })

  it('handles a night owl whose bedtime is after midnight', () => {
    const late = { ...day, wake: 9 * 60, bed: 60 }
    expect(minutesFor('wind-down', late)).toBe(0)
    expect(minutesFor('morning', late)).toBe(9 * 60 + 30)
  })

  it('orders the day from waking, groups shared moments, and ends with the untimed ones', () => {
    const r = routineFor(
      [
        product('Magnesium', { cadence: 'as-needed', servingsPerUnit: 60, anchor: 'wind-down', asNeededTrigger: 'sleep' }),
        product('Creatine', { cadence: 'daily', servingsPerUnit: 60, anchor: 'morning' }),
        product('Multivitamin', { cadence: 'daily', servingsPerUnit: 30, anchor: 'morning' }),
        product('Pre', { cadence: 'per-workout', servingsPerUnit: 30, anchor: 'pre-workout' }),
        product('Electrolytes', { cadence: 'as-needed', servingsPerUnit: 20, anchor: 'hot-days', asNeededTrigger: 'sweat' }),
      ],
      day,
      { Creatine: 2 },
    )
    expect(r.moments.map((m) => m.label)).toEqual(['With breakfast', 'Before you train', 'An hour before bed', 'When you choose'])
    expect(r.moments[0].items.map((i) => i.title)).toEqual(['Creatine', 'Multivitamin'])
    expect(r.items.find((i) => i.productId === 'Creatine')!.amount).toBe('2 servings')
    expect(r.items.find((i) => i.productId === 'Pre')!.daysLabel).toBe('On Mon, Wed, Fri')
    expect(r.items.find((i) => i.productId === 'Electrolytes')!.moment).toBe('On hot days or after long sessions')
  })

  it('never names a health reason: no sleep, stress, immunity, energy or mood words', () => {
    const words = JSON.stringify(ROUTINE_COPY).toLowerCase()
    for (const w of ['sleep', 'stress', 'immun', 'energy', 'mood', 'recover', 'focus', 'calm', 'run down', 'boost']) expect(words).not.toContain(w)
  })

  it('places every product in the catalogue somewhere', () => {
    const r = routineFor(MOCK_CATALOGUE, defaultDay())
    expect(r.items).toHaveLength(MOCK_CATALOGUE.length)
    expect(r.moments.flatMap((m) => m.items)).toHaveLength(MOCK_CATALOGUE.length)
    for (const p of MOCK_CATALOGUE) expect(ROUTINE_COPY.moment[anchorOf(p)]).toBeTruthy()
  })

  it('takes the original quiz’s training answers on a stated 7am to 11pm day', () => {
    expect(dayFromQuiz({ trainingTime: 'evening', trainingFrequency: '3-4x' })).toEqual({
      wake: 420, bed: 1380, trainAt: 1110, trainDays: 3, trainWeekdays: null, assumed: true,
    })
    expect(dayFromQuiz({ trainingTime: 'varies', trainingFrequency: null }).trainAt).toBeNull()
  })

  it('keeps a day from outside to sane values', () => {
    expect(normaliseDay({ wake: 99999, bed: 'x', trainAt: 1110.4, trainDays: 99, trainWeekdays: [6, 0, 0, 9], assumed: false })).toEqual({
      wake: 1439, bed: 1380, trainAt: 1110, trainDays: null, trainWeekdays: [0, 6], assumed: false,
    })
    expect(normaliseDay(null)).toEqual(defaultDay())
  })
})
