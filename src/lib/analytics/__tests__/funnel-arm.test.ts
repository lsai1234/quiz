import { buildQuizFunnel, filterByArm, sessionArms } from '../funnel'
import type { StoredEvent } from '../repo'
import type { AnalyticsEvent, EventProps } from '../events'

/**
 * Splitting the funnel by arm.
 *
 * The experiment is only readable if a session's events can be attributed to
 * one quiz or the other, and the tricky part is that the arm is not known at
 * the very first event — `/api/config` may not have answered yet, and the
 * unresolved default is v1.
 */

let n = 0
const ev = (event: AnalyticsEvent, sessionId: string | null, props: EventProps = {}): StoredEvent => ({
  id: `e${n++}`,
  sessionId,
  event,
  props,
  path: '/',
  createdAt: new Date(2026, 0, 1, 0, 0, n).toISOString(),
})

describe('attributing a session to an arm', () => {
  it('takes v2 from any event in the session', () => {
    // The first event can fire before the arm resolves, defaulting to v1. v2 is
    // only ever set deliberately, so it is the half worth trusting.
    const events = [
      ev('quiz_start', 's1', { arm: 'v1' }),
      ev('quiz_step_view', 's1', { arm: 'v2', stepId: 'goals', index: 0 }),
    ]
    expect(sessionArms(events).get('s1')).toBe('v2')
  })

  it('leaves a session v1 when nothing ever said otherwise', () => {
    expect(sessionArms([ev('quiz_start', 's1', { arm: 'v1' })]).get('s1')).toBe('v1')
  })

  it('counts events recorded before the experiment shipped as v1', () => {
    const events = [ev('quiz_start', 's1'), ev('quiz_complete', 's1')]
    expect(filterByArm(events, 'v1')).toHaveLength(2)
    expect(filterByArm(events, 'v2')).toHaveLength(0)
  })

  it('ignores events with no session — they cannot be attributed', () => {
    expect(filterByArm([ev('quiz_start', null, { arm: 'v2' })], 'v2')).toHaveLength(0)
  })
})

describe('the split funnel', () => {
  const events = [
    // v1: two started, one finished, one bought.
    ev('quiz_start', 'a', { arm: 'v1' }),
    ev('quiz_step_view', 'a', { arm: 'v1', stepId: 'goals', index: 0 }),
    ev('quiz_complete', 'a', { arm: 'v1' }),
    ev('purchase', 'a', { arm: 'v1' }),
    ev('quiz_start', 'b', { arm: 'v1' }),
    ev('quiz_step_view', 'b', { arm: 'v1', stepId: 'goals', index: 0 }),

    // v2: two started, two finished, none bought.
    ev('quiz_start', 'c', { arm: 'v2' }),
    ev('quiz_step_view', 'c', { arm: 'v2', stepId: 'goals', index: 0 }),
    ev('quiz_step_view', 'c', { arm: 'v2', stepId: 'energy-when', index: 3 }),
    ev('quiz_complete', 'c', { arm: 'v2' }),
    ev('quiz_start', 'd', { arm: 'v2' }),
    ev('quiz_step_view', 'd', { arm: 'v2', stepId: 'goals', index: 0 }),
    ev('quiz_complete', 'd', { arm: 'v2' }),
  ]

  it('counts each arm separately', () => {
    const v1 = buildQuizFunnel(events, 'v1')
    const v2 = buildQuizFunnel(events, 'v2')
    expect(v1.started).toBe(2)
    expect(v1.completed).toBe(1)
    expect(v1.purchased).toBe(1)
    expect(v2.started).toBe(2)
    expect(v2.completed).toBe(2)
    expect(v2.purchased).toBe(0)
  })

  it('counts everyone when no arm is given', () => {
    expect(buildQuizFunnel(events).started).toBe(4)
  })

  it("builds v2's step ladder from v2's own question ids", () => {
    // The property that lets one funnel serve two quizzes: steps come from the
    // events rather than a fixed list, so v2's bank ids need no new code.
    const v2 = buildQuizFunnel(events, 'v2')
    expect(v2.steps.map((s) => s.stepId)).toEqual(['goals', 'energy-when'])
    // And v1's ladder is not polluted by them.
    expect(buildQuizFunnel(events, 'v1').steps.map((s) => s.stepId)).toEqual(['goals'])
  })
})
