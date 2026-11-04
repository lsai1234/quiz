import { dayFromConsult } from '../routine-day'
import { EMPTY_ANSWERS } from '../types'

describe('the consult’s answers as a day', () => {
  it('takes wake, bed, training days and the time they train, and nothing else', () => {
    const a = {
      ...EMPTY_ANSWERS,
      sleep: { bed: 23 * 60, wake: 6 * 60 + 30, quality: 2 },
      training: { mode: 'days' as const, days: [['gym'], [], ['cardio'], [], ['gym'], [], []] as ('gym' | 'cardio' | 'sport')[][], average: { gym: 0, cardio: 0, sport: 0 } },
    }
    const d = dayFromConsult(a as never)
    expect(d).toEqual({ wake: 390, bed: 1380, trainAt: null, trainDays: 3, trainWeekdays: [0, 2, 4], assumed: false })
    expect(Object.keys(d).sort()).toEqual(['assumed', 'bed', 'trainAt', 'trainDays', 'trainWeekdays', 'wake'])
  })

  it('falls back to the stated day when they skipped sleep', () => {
    expect(dayFromConsult(EMPTY_ANSWERS).assumed).toBe(true)
  })
})
