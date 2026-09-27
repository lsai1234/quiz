import { flowReducer, initialFlow, isAnswered, visibleScenes, type FlowState } from '../../flow'
import { PERSONAS } from '../../personas'
import { EMPTY_ANSWERS, type ConsultAnswers } from '../../types'
import { needsRecheck } from '../screen'
import { isPinned, leads } from '../leads'

/**
 * The payoff (plan v5 §6, phase 4): the upgrade from the other routes keeps
 * every answer, and a pattern an edit undercut is flagged for a recheck.
 */

const WIRED = PERSONAS.find((p) => p.id === 'p34')!.answers as ConsultAnswers

const onReview = (answers: Partial<ConsultAnswers>): FlowState => ({
  ...initialFlow('c_payoff0001', 0, answers),
  sceneId: 'review',
  history: ['goals', 'about'],
  answers: { ...EMPTY_ANSWERS, ...answers },
})

describe('recheck', () => {
  it('leaves a pattern alone while what it rested on stands', () => {
    expect(needsRecheck(WIRED, 'wired')).toBe(false)
  })

  it('flags it once an answer it rested on changes', () => {
    const changed = { ...WIRED, caffeine: { coffee: 0, tea: 0, energy: 0 }, sleep: { bed: 22 * 60, wake: 7 * 60, quality: 'restful' as const } }
    expect(needsRecheck(changed, 'wired')).toBe(true)
    // Still pinpointed until they say otherwise: the verdict is theirs.
    expect(leads(changed).find((l) => l.pattern.id === 'wired')!.state).toBe('yes')
  })

  it('lifts the verdict and reopens the round, then comes back to the review', () => {
    const state = onReview({ ...WIRED, pinpoint: { ...WIRED.pinpoint!, stopped: true } })
    const next = flowReducer(state, { type: 'recheck', pattern: 'wired' })
    expect(next.sceneId).toBe('pinpoint')
    expect(next.returnTo).toBe('review')
    expect(next.answers.pinpoint!.stopped).toBe(false)
    expect(next.answers.pinpoint!.steps.some((s) => s.kind === 'verdict' && s.pattern === 'wired')).toBe(false)
    expect(leads(next.answers).filter(isPinned)).toHaveLength(0)
  })
})

describe('the upgrade', () => {
  const deep: Partial<ConsultAnswers> = { ...WIRED, route: 'deep', pinpoint: null }

  it('keeps every answer and goes to the first thing still to ask', () => {
    const state = onReview(deep)
    const next = flowReducer(state, { type: 'upgrade' })
    expect(next.answers.route).toBe('pinpoint')
    expect(next.answers.pinpoint).toEqual({ steps: [], stopped: false })
    const { route: _a, pinpoint: _b, ...before } = state.answers
    const { route: _c, pinpoint: _d, ...after } = next.answers
    expect(after).toEqual(before)
    expect(isAnswered(next.sceneId, next.answers)).toBe(false)
    expect(visibleScenes(next.answers)).toContain(next.sceneId)
    // Back returns to the review it came from.
    expect(next.history[next.history.length - 1]).toBe('review')
  })

  it('from a Speed run, asks the core screens it skipped first', () => {
    const speed = flowReducer(onReview({ route: 'speed', goals: ['energy'], age: '35-44', sex: 'female', energy: 3, comfortOffered: true }), { type: 'upgrade' })
    expect(['training', 'energy', 'sleep', 'daylight', 'caffeine', 'food', 'body', 'shelf']).toContain(speed.sceneId)
  })

  it('does nothing on the Pinpoint route', () => {
    const state = onReview(WIRED)
    expect(flowReducer(state, { type: 'upgrade' })).toBe(state)
  })
})
