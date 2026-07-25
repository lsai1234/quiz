import { funnel } from '../quiz'

// Mock only the transport so we can assert the event contract (names + props)
// without touching sendBeacon; the real event-name constants come through
// requireActual so the "registered names" check is meaningful.
jest.mock('../events', () => {
  const actual = jest.requireActual('../events')
  return { ...actual, track: jest.fn() }
})
import { track, QUIZ_EVENTS, SHOP_EVENTS } from '../events'

const mockTrack = track as jest.Mock

describe('funnel', () => {
  beforeEach(() => mockTrack.mockClear())

  it('drops a null track to undefined (never serialises "null")', () => {
    funnel.start({ track: null, drinksMode: false })
    expect(mockTrack).toHaveBeenCalledWith('quiz_start', { track: undefined, drinksMode: false })
  })

  it('stepView carries the full timing context', () => {
    funnel.stepView({ stepId: 'goals', index: 0, total: 8, track: 'performance', drinksMode: false })
    expect(mockTrack).toHaveBeenCalledWith('quiz_step_view', {
      stepId: 'goals', index: 0, total: 8, track: 'performance', drinksMode: false,
    })
  })

  it('stepComplete carries time-on-question', () => {
    funnel.stepComplete({ stepId: 'diet', index: 3, msOnStep: 1200 })
    expect(mockTrack).toHaveBeenCalledWith('quiz_step_complete', { stepId: 'diet', index: 3, msOnStep: 1200 })
  })

  it('stepBack distinguishes back vs edit-jump', () => {
    funnel.stepBack({ from: 'review', to: 'goals', via: 'edit' })
    expect(mockTrack).toHaveBeenCalledWith('quiz_step_back', { from: 'review', to: 'goals', via: 'edit' })
  })

  it('complete drops nullish budget/primaryGoal/track', () => {
    funnel.complete({ track: 'wellbeing', drinksMode: true, goalCount: 2, primaryGoal: undefined, budget: null, msTotal: 5000 })
    expect(mockTrack).toHaveBeenCalledWith('quiz_complete', {
      track: 'wellbeing', drinksMode: true, goalCount: 2, primaryGoal: undefined, budget: undefined, msTotal: 5000,
    })
  })

  it('checkout events reuse the shop names but tag source: quiz', () => {
    funnel.checkoutStart({ plan: 'subscription', total: 60 })
    funnel.checkoutSuccess({ plan: 'subscription', total: 60 })
    expect(mockTrack).toHaveBeenCalledWith('checkout_start', { plan: 'subscription', total: 60, source: 'quiz' })
    expect(mockTrack).toHaveBeenCalledWith('checkout_success', { plan: 'subscription', total: 60, source: 'quiz' })
  })

  it('every wrapper emits a registered event, and every quiz event is covered', () => {
    const known = new Set<string>([...QUIZ_EVENTS, ...SHOP_EVENTS])
    funnel.start({ track: null, drinksMode: false })
    funnel.stepView({ stepId: 'goals', index: 0, total: 8, track: null, drinksMode: false })
    funnel.stepComplete({ stepId: 'goals', index: 0, msOnStep: 1 })
    funnel.stepBack({ from: 'diet', to: 'supps', via: 'back' })
    funnel.subView({ subId: 'x', parentStepId: 'type' })
    funnel.subAnswer({ subId: 'x', parentStepId: 'type', optionId: 'y' })
    funnel.deepDiveOffer()
    funnel.deepDiveAccept()
    funnel.complete({ track: null, drinksMode: false, goalCount: 1, budget: null, msTotal: 1 })
    funnel.abandon({ lastStepId: 'diet', index: 3, msTotal: 1 })
    funnel.revealView({ slotCount: 3, oneOff: 40, sub: 30, plan: 'oneoff' })
    funnel.stackSwap({ slotId: 's', to: 'p' })
    funnel.stackAdd({ productId: 'p' })
    funnel.stackRemove({ slotId: 's' })
    funnel.checkoutStart({ plan: 'oneoff', total: 40 })
    funnel.checkoutSuccess({ plan: 'oneoff', total: 40 })

    const emitted = new Set(mockTrack.mock.calls.map((c) => c[0] as string))
    // All emitted names are registered (guards typos + missing route registration).
    for (const name of emitted) expect(known.has(name)).toBe(true)
    // Every declared quiz event is actually emitted by some wrapper (coverage).
    for (const e of QUIZ_EVENTS) expect(emitted.has(e)).toBe(true)
  })
})
