import { CURVE_HOURS, PRESET_POINTS, afternoonLevel, curvePatch, curveWords, pointsFromStroke, readCurve } from '../day-curve'
import { summarise } from '../summary'
import { EMPTY_ANSWERS } from '../types'

/** Shape your day (plan Phase 7.4): the curve, and what's read off it. */
describe('drawing the curve', () => {
  it('has ten points, every two hours from 06:00 to midnight', () => {
    expect(CURVE_HOURS).toEqual([6, 8, 10, 12, 14, 16, 18, 20, 22, 24])
    for (const p of Object.values(PRESET_POINTS)) expect(p).toHaveLength(10)
  })

  it('turns a stroke into the points under it, filling the gaps between samples', () => {
    // Left to right, full to empty, in three samples.
    expect(pointsFromStroke([{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }])).toEqual([10, 9, 8, 7, 6, 4, 3, 2, 1, 0])
  })

  it('keeps the points a short stroke never reached', () => {
    const before = [6, 7, 7, 7, 7, 7, 7, 6, 5, 4]
    expect(pointsFromStroke([{ x: 4 / 9, y: 0.8 }, { x: 5 / 9, y: 0.8 }], before)).toEqual([6, 7, 7, 7, 2, 2, 7, 6, 5, 4])
  })

  it('draws the same right to left', () => {
    expect(pointsFromStroke([{ x: 1, y: 1 }, { x: 0, y: 0 }])).toEqual(pointsFromStroke([{ x: 0, y: 0 }, { x: 1, y: 1 }]))
  })

  it('clamps strokes off the edges', () => {
    expect(pointsFromStroke([{ x: -0.2, y: -0.5 }, { x: 1.3, y: -0.5 }])).toEqual(CURVE_HOURS.map(() => 10))
  })
})

describe('what it reads', () => {
  it('keeps the 1–10 energy: the level at 14:00–16:00, never 0', () => {
    expect(afternoonLevel(PRESET_POINTS['dip-3pm'])).toBe(4)
    expect(afternoonLevel(PRESET_POINTS.steady)).toBe(7)
    expect(afternoonLevel(CURVE_HOURS.map(() => 0))).toBe(1)
  })

  it('finds the dip, its time and depth', () => {
    expect(readCurve(PRESET_POINTS['dip-3pm']).dip).toEqual({ at: 16 * 60, depth: 3 })
    expect(readCurve(PRESET_POINTS.steady).dip).toBeNull()
  })

  it('tells a slow morning and a second wind, not a recovery from the dip', () => {
    expect(readCurve(PRESET_POINTS['slow-starter'])).toMatchObject({ slowMorning: true, eveningRise: false })
    expect(readCurve(PRESET_POINTS['second-wind'])).toMatchObject({ slowMorning: false, eveningRise: true })
    expect(readCurve(PRESET_POINTS['dip-3pm'])).toMatchObject({ slowMorning: false, eveningRise: false })
  })

  it('writes the curve and the afternoon level; Not sure writes no level', () => {
    expect(curvePatch({ points: PRESET_POINTS.steady, how: 'preset', preset: 'steady' })).toEqual({ energyCurve: { points: PRESET_POINTS.steady, how: 'preset', preset: 'steady' }, energy: 7 })
    expect(curvePatch({ points: null, how: 'preset', preset: 'unsure' }).energy).toBeNull()
  })

  it('says it in words', () => {
    expect(curveWords(PRESET_POINTS['dip-3pm'])).toBe('Energy dips around 16:00')
    expect(curveWords(PRESET_POINTS['slow-starter'])).toBe('Energy slow to get going')
    expect(curveWords(PRESET_POINTS.steady)).toBe('Energy steady, 7 out of 10 in the afternoon')
    expect(curveWords([2, 3, 6, 7, 4, 4, 5, 8, 9, 6])).toBe('Energy slow to get going, dips around 14:00, a second wind in the evening')
  })

  it('reads back on the review', () => {
    const a = { ...EMPTY_ANSWERS, ...curvePatch({ points: PRESET_POINTS['dip-3pm'], how: 'preset', preset: 'dip-3pm' }) }
    expect(summarise('energy', a)).toBe('3pm dip · 4 / 10 in the afternoon')
    expect(summarise('energy', { ...a, energyCurve: { ...a.energyCurve!, how: 'drawn', preset: null } })).toBe('Drawn · 4 / 10 in the afternoon')
    expect(summarise('energy', { ...EMPTY_ANSWERS, ...curvePatch({ points: null, how: 'preset', preset: 'unsure' }) })).toBe('Not sure')
    // A consult saved before the curve: the battery's level.
    expect(summarise('energy', { ...EMPTY_ANSWERS, energy: 6 })).toBe('6 / 10')
  })
})
