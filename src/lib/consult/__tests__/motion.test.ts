import { DURATION, SPRING, motionVars, sceneEnterClass, springAt, springEasing, haptic } from '../motion'

describe('the one spring', () => {
  const samples = Array.from({ length: 400 }, (_, i) => springAt((i / 400) * 2))

  it('starts at rest and settles on 1', () => {
    expect(springAt(0)).toBeCloseTo(0)
    expect(springAt(2)).toBeCloseTo(1, 3)
  })

  it('overshoots once, a little, and never visibly a second time', () => {
    const peak = Math.max(...samples)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThan(1.05)

    // After the first peak, the trace dips back below 1 and must not climb
    // visibly (half a percent) above it again.
    const firstPeak = samples.indexOf(peak)
    const afterDip = samples.slice(firstPeak).findIndex((v) => v < 1) + firstPeak
    expect(Math.max(...samples.slice(afterDip))).toBeLessThan(1.005)
  })

  it('is mostly there by the end of a scene transition', () => {
    expect(springAt(DURATION.scene / 1000)).toBeGreaterThan(0.97)
  })

  it('renders as a CSS linear() that ends exactly on 1', () => {
    const easing = springEasing()
    expect(easing).toMatch(/^linear\(0, /)
    expect(easing).toMatch(/, 1\)$/)
    expect(SPRING.damping / (2 * Math.sqrt(SPRING.stiffness * SPRING.mass))).toBeLessThan(1)
  })
})

describe('motion variables', () => {
  it('collapse every duration to zero for reduced motion, keeping the layout', () => {
    const vars = motionVars(true) as Record<string, string>
    for (const [name, value] of Object.entries(vars)) {
      if (name.startsWith('--amp-duration')) expect(value).toBe('0ms')
    }
    expect(vars['--amp-press-scale']).toBe('1')
  })

  it('carry real durations otherwise', () => {
    const vars = motionVars(false) as Record<string, string>
    expect(vars['--amp-duration-scene']).toBe(`${DURATION.scene}ms`)
  })
})

describe('scene transitions', () => {
  it('slide in the direction of travel, and back reverses', () => {
    expect(sceneEnterClass('forward', false)).toBe('amp-anim-scene-forward')
    expect(sceneEnterClass('back', false)).toBe('amp-anim-scene-back')
  })

  it('are instant under reduced motion', () => {
    expect(sceneEnterClass('forward', true)).toBe('')
  })
})

describe('haptics', () => {
  it('are a no-op where the browser has no motor', () => {
    expect(() => haptic('tick')).not.toThrow()
  })

  it('never throw, even when vibrate does', () => {
    const vibrate = jest.fn(() => {
      throw new Error('no gesture')
    })
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    expect(() => haptic('charge')).not.toThrow()
    expect(vibrate).toHaveBeenCalled()
  })
})
