import { FLIGHT_SLOT, flightToken, flip, fly } from '../flight'
import { trainingDays } from '../training'
import { EMPTY_ANSWERS, type ConsultAnswers } from '../types'

/** Shared-element flights (plan Phase 7.1): what flies, where to, and how. */
const A: ConsultAnswers = {
  ...EMPTY_ANSWERS,
  training: trainingDays(['gym', 'rest', 'gym', 'rest', 'cardio', 'rest', 'rest']),
  energy: 6,
  sleep: { bed: 23 * 60 + 15, wake: 7 * 60, quality: 'ok' },
  daylight: 'most',
  caffeine: { coffee: 2, tea: 1, energy: 0 },
}

describe('flightToken', () => {
  it('gives each of the day ring’s five answers a short token and its slot', () => {
    expect(Object.keys(FLIGHT_SLOT).sort()).toEqual(['caffeine', 'daylight', 'energy', 'sleep', 'training'])
    expect(flightToken('sleep', A)).toEqual({ scene: 'sleep', slot: 'sleep', label: '23:15–07:00' })
    expect(flightToken('caffeine', A)).toEqual({ scene: 'caffeine', slot: 'caffeine', label: '3 a day' })
    expect(flightToken('energy', A)?.label).toBe('6 / 10')
    expect(flightToken('training', A)?.label).toBe('3 a week')
    expect(flightToken('daylight', A)?.slot).toBe('daylight')
  })

  it('flies nothing for scenes off the ring, or for no answer', () => {
    for (const id of ['goals', 'about', 'food', 'protein', 'body', 'shelf', 'circuit', 'review', 'pinpoint'] as const) expect([id, flightToken(id, A)]).toEqual([id, null])
    expect(flightToken('sleep', EMPTY_ANSWERS)).toBeNull()
  })
})

describe('flip', () => {
  it('starts centred on the answer at full size, and lands centred in its slot, scaled to fit', () => {
    const f = flip({ x: 0, y: 400, width: 390, height: 200 }, { x: 20, y: 100, width: 40, height: 40 }, { width: 100, height: 20 })
    expect(f.first).toBe('translate(145px, 490px) scale(1)')
    expect(f.scale).toBeCloseTo(0.4)
    expect(f.last).toBe('translate(20px, 116px) scale(0.4)')
  })

  it('never grows the token into a bigger slot', () => {
    expect(flip({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 400, height: 400 }, { width: 100, height: 20 }).scale).toBe(1)
  })
})

describe('fly', () => {
  afterEach(() => {
    delete (Element.prototype as { animate?: unknown }).animate
  })

  it('does nothing, and leaves nothing behind, where the browser can’t animate', () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    expect(fly({ scene: 'sleep', slot: 'sleep', label: '23:00–07:00' }, { x: 0, y: 0, width: 10, height: 10 }, target)).toBeNull()
    expect(document.querySelector('.amp-flight')).toBeNull()
  })

  it('moves one token on the consult’s spring, and removes it when it lands', async () => {
    let resolve!: () => void
    const finished = new Promise<void>((r) => (resolve = r))
    const calls: { keyframes: Keyframe[]; options: KeyframeAnimationOptions }[] = []
    ;(Element.prototype as unknown as { animate: unknown }).animate = function (keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ keyframes, options })
      return { finished } as unknown as Animation
    }
    const target = document.createElement('div')
    document.body.appendChild(target)
    fly({ scene: 'caffeine', slot: 'caffeine', label: '3 a day' }, { x: 0, y: 300, width: 300, height: 100 }, target)
    const el = document.querySelector('.amp-flight')!
    expect(el.textContent).toBe('3 a day')
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(calls[0].keyframes.map((k) => k.transform)).toEqual([expect.stringMatching(/^translate\(/), expect.stringMatching(/^translate\(/)])
    expect(calls[0].options).toMatchObject({ duration: 480, easing: expect.stringMatching(/^linear\(/) })
    resolve()
    await finished
    await Promise.resolve()
    expect(document.querySelector('.amp-flight')).toBeNull()
  })
})
