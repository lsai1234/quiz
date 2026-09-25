import { buildConsultFunnel, compareDoors } from '../consult-funnel'
import type { StoredEvent } from '../repo'

let n = 0
const ev = (sessionId: string, event: string, props: Record<string, unknown> = {}): StoredEvent =>
  ({ id: ++n, event, props, sessionId, path: '/', at: new Date(2026, 8, 1, 0, 0, n).toISOString() }) as unknown as StoredEvent

function consultSession(id: string, reach: string[], extra: StoredEvent[] = []): StoredEvent[] {
  const out = [ev(id, 'consult_start', { route: 'deep' })]
  reach.forEach((sceneId, i) => {
    out.push(ev(id, 'consult_scene_view', { sceneId, index: i + 1, total: 12 }))
    if (i < reach.length - 1) out.push(ev(id, 'consult_scene_complete', { sceneId, index: i + 1, msOnScene: 6000, interactions: 3 }))
  })
  return [...out, ...extra]
}

describe('H12 consult funnel', () => {
  const events = [
    ...consultSession('a', ['goals', 'about', 'training'], [ev('a', 'consult_complete'), ev('a', 'stack_reveal_view'), ev('a', 'checkout_start'), ev('a', 'purchase', { journey_variant: 'personalised_subscription' })]),
    ...consultSession('b', ['goals', 'about', 'training']),
    ...consultSession('c', ['goals', 'about']),
    ...consultSession('d', ['goals']),
    ev('q1', 'quiz_start'),
    ev('q1', 'quiz_complete'),
    ev('q1', 'stack_reveal_view'),
    ev('q1', 'purchase', { journey_variant: 'standard' }),
    ev('q2', 'quiz_start'),
  ]

  it('counts drop-off per scene, by session', () => {
    const f = buildConsultFunnel(events)
    expect(f.started).toBe(4)
    expect(f.scenes.map((s) => [s.sceneId, s.sessions, s.dropped])).toEqual([
      ['goals', 4, 0],
      ['about', 3, 1],
      ['training', 2, 1],
    ])
    expect(f.worstScene?.sceneId).toBe('about')
  })

  it('counts a revisited scene once', () => {
    const f = buildConsultFunnel([...events, ev('a', 'consult_scene_view', { sceneId: 'goals', index: 1 })])
    expect(f.scenes[0].sessions).toBe(4)
  })

  it('reads time per scene and per interaction', () => {
    const goals = buildConsultFunnel(events).scenes[0]
    expect(goals.medianSeconds).toBe(6)
    expect(goals.medianInteractions).toBe(3)
    expect(goals.secondsPerInteraction).toBe(2)
  })

  it('follows consult → results → subscription, against the old quiz', () => {
    const { consult, quiz } = compareDoors(events)
    expect(consult).toMatchObject({ started: 4, completed: 1, reachedResults: 1, startedCheckout: 1, purchased: 1, subscribed: 1 })
    expect(consult.subscriptionPct).toBe(0.25)
    expect(quiz).toMatchObject({ started: 2, completed: 1, reachedResults: 1, purchased: 1, subscribed: 0 })
  })

  it('keeps the two doors apart: a quiz purchase never counts for the consult', () => {
    expect(buildConsultFunnel([ev('q9', 'quiz_start'), ev('q9', 'purchase')]).purchased).toBe(0)
  })

  it('tallies circuit check stops by kind, without any answers', () => {
    const f = buildConsultFunnel([...events, ev('b', 'consult_stop', { reason: 'pregnancy' })])
    expect(f.stopped).toEqual({ pregnancy: 1 })
  })
})
