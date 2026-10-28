import { angleOf, arcPath, clock, curveOnRing, dayRingData, dayRingLines, dayRingText, pointAt } from '../day-ring'
import { PRESET_POINTS } from '../day-curve'
import { trainingDays } from '../training'
import { EMPTY_ANSWERS, type ConsultAnswers } from '../types'

/** The day ring (plan Phase 7.3): what it plots, and the ring in words. */
const told = (a: Partial<ConsultAnswers>): ConsultAnswers => ({ ...EMPTY_ANSWERS, ...a })
const TIMES = {
  pinpoint: {
    steps: [
      { kind: 'probe' as const, probe: 'last-caffeine', answer: {}, minutes: 16 * 60, stage: 'follow-fuel' as const },
      { kind: 'probe' as const, probe: 'train-when', answer: {}, minutes: 18 * 60 + 30, stage: 'follow-move' as const },
    ],
    stopped: false,
  },
}
const FULL = told({
  sleep: { bed: 23 * 60 + 30, wake: 6 * 60, quality: 'ok' },
  caffeine: { coffee: 2, tea: 1, energy: 0 },
  training: trainingDays(['gym', 'rest', 'gym', 'rest', 'cardio', 'rest', 'rest']),
  daylight: 'some',
  energy: 4,
})

describe('the dial', () => {
  it('runs midnight at the top, clockwise, like a watch', () => {
    expect([angleOf(0), angleOf(6 * 60), angleOf(12 * 60), angleOf(18 * 60)]).toEqual([0, 90, 180, 270])
    expect(pointAt(0, 44)).toEqual({ x: 50, y: 6 })
    expect(pointAt(6 * 60, 44)).toEqual({ x: 94, y: 50 })
    expect(clock(23 * 60 + 30)).toBe('23:30')
    expect(clock(24 * 60 + 15)).toBe('00:15')
  })

  it('draws an overnight arc the short way round, past midnight', () => {
    // 23:30 to 06:00 is six and a half hours: under half the dial.
    expect(arcPath(23 * 60 + 30, 6 * 60, 44)).toMatch(/A44 44 0 0 1 /)
    expect(arcPath(6 * 60, 23 * 60, 44)).toMatch(/A44 44 0 1 1 /)
  })
})

describe('what it plots: only what they’ve told us', () => {
  it('plots nothing before anything is answered', () => {
    expect(dayRingData(EMPTY_ANSWERS)).toEqual({ sleep: null, caffeine: null, training: null, daylight: null, energy: null })
    expect(dayRingText(dayRingData(EMPTY_ANSWERS))).toBe('Your day, filling in as you answer')
  })

  it('without Pinpoint’s times, gives caffeine as a count and training as days a week', () => {
    const d = dayRingData(FULL)
    expect(d).toMatchObject({ sleep: { bed: 1410, wake: 360 }, caffeine: { count: 3 }, training: { days: 3 }, daylight: { answer: 'some' }, energy: { level: 4 } })
  })

  it('puts the last cup and the training at their times once Pinpoint has asked', () => {
    const d = dayRingData(told({ ...FULL, ...TIMES }))
    expect(d.caffeine).toEqual({ at: 960 })
    expect(d.training).toEqual({ at: 1110 })
  })

  it('says it in words, in the plan’s own form', () => {
    expect(dayRingText(dayRingData(told({ ...FULL, ...TIMES })))).toBe(
      'Your day: sleep 23:30 to 06:00, last coffee about 16:00, trains around 18:30, daylight some days, afternoon energy 4 out of 10',
    )
    expect(dayRingLines(dayRingData(told({ caffeine: { coffee: 0, tea: 0, energy: 0 }, training: trainingDays(['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest']) }))).map((l) => l.text)).toEqual([
      'no caffeine',
      'no training',
    ])
  })
})

describe('the day they drew (plan Phase 7.4)', () => {
  const drawn = told({ ...FULL, energyCurve: { points: PRESET_POINTS['dip-3pm'], how: 'preset', preset: 'dip-3pm' } })

  it('plots the curve, with the dip marked, in place of the afternoon arc', () => {
    expect(dayRingData(drawn).energy).toEqual({ points: PRESET_POINTS['dip-3pm'], dip: 16 * 60 })
  })

  it('runs the curve round the dial from 06:00 to midnight, its level as distance from the middle', () => {
    const d = curveOnRing([0, 0, 0, 0, 0, 0, 0, 0, 0, 10], 24, 38)
    expect(d.startsWith(`M${pointAt(6 * 60, 24).x} ${pointAt(6 * 60, 24).y}`)).toBe(true)
    expect(d.endsWith(`L${pointAt(0, 38).x} ${pointAt(0, 38).y}`)).toBe(true)
    expect(d.match(/[ML]/g)).toHaveLength(10)
  })

  it('says the shape in words', () => {
    expect(dayRingLines(dayRingData(drawn)).find((l) => l.slot === 'energy')?.text).toBe('energy dips around 16:00')
  })
})
