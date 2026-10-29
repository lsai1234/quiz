import { BOUNCE, MAX_LEAN, WOBBLE_FROM, dropped, fall, knock, still, sway, upright, type Cup } from '../cup-physics'

/** The cup stack (plan Phase 7.6): a few lines of physics. */
function drop(height: number) {
  let c: Cup = dropped(height)
  const impacts: number[] = []
  let t = 0
  for (; t < 3 && !c.settled; t += 1 / 60) {
    const step = fall(c, 1 / 60)
    if (step.impact !== null) impacts.push(step.impact)
    c = step.cup
  }
  return { c, impacts, t }
}

describe('a cup dropping', () => {
  it('falls, bounces once, and settles where it belongs, quickly', () => {
    const { c, impacts, t } = drop(72)
    expect(c).toEqual({ y: 0, vy: 0, settled: true })
    // Nothing in the consult bounces twice: one bounce, then the second contact settles it.
    expect(impacts).toHaveLength(2)
    // The bounce keeps about BOUNCE of the speed (stepped at 60fps, so near enough).
    expect(Math.abs(impacts[1] / (impacts[0] * BOUNCE) - 1)).toBeLessThan(0.1)
    expect(t).toBeLessThan(0.6)
  })

  it('stays put once settled', () => {
    expect(fall({ y: 0, vy: 0, settled: true }, 1 / 60)).toEqual({ cup: { y: 0, vy: 0, settled: true }, impact: null })
  })
})

describe('a stack', () => {
  it('lands solid under four cups', () => {
    expect(knock(upright(), WOBBLE_FROM - 1, 800, 1)).toEqual(upright())
  })

  it('wobbles from four, harder the taller it is, and comes back upright', () => {
    const four = knock(upright(), 4, 800, 1)
    const seven = knock(upright(), 7, 800, 1)
    expect(four.spin).toBeGreaterThan(0)
    expect(seven.spin).toBeGreaterThan(four.spin)
    expect(knock(upright(), 4, 800, -1).spin).toBeLessThan(0)
    let s = seven
    let most = 0
    for (let i = 0; i < 240 && !(i > 10 && still(s)); i++) {
      s = sway(s, 1 / 60)
      most = Math.max(most, Math.abs(s.angle))
    }
    expect(most).toBeGreaterThan(1)
    expect(most).toBeLessThanOrEqual(MAX_LEAN)
    expect(still(s)).toBe(true)
  })
})
