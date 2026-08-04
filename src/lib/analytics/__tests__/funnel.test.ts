import { buildQuizFunnel } from '../funnel'
import type { StoredEvent } from '../repo'
import type { AnalyticsEvent, EventProps } from '../events'

let seq = 0
const ev = (session: string, event: AnalyticsEvent, props: EventProps = {}): StoredEvent => ({
  id: `e${seq++}`,
  sessionId: session,
  event,
  props,
  path: '/quiz',
  createdAt: new Date(2026, 7, 1, 0, 0, seq).toISOString(),
})

/** One visitor who views steps 0..n and optionally completes. */
function journey(session: string, steps: string[], opts: { complete?: boolean; reveal?: boolean; checkout?: boolean; purchase?: boolean } = {}) {
  const out: StoredEvent[] = [ev(session, 'quiz_start')]
  steps.forEach((stepId, index) => out.push(ev(session, 'quiz_step_view', { stepId, index })))
  if (opts.complete) out.push(ev(session, 'quiz_complete'))
  if (opts.reveal) out.push(ev(session, 'stack_reveal_view'))
  if (opts.checkout) out.push(ev(session, 'checkout_start'))
  if (opts.purchase) out.push(ev(session, 'purchase'))
  return out
}

const STEPS = ['goals', 'personal', 'frequency', 'review']

describe('quiz funnel', () => {
  it('counts a session once per step, however many times they backtrack', () => {
    const events = [
      ...journey('s1', STEPS),
      // s1 goes back and re-answers 'personal' twice.
      ev('s1', 'quiz_step_view', { stepId: 'personal', index: 1 }),
      ev('s1', 'quiz_step_view', { stepId: 'personal', index: 1 }),
    ]
    const f = buildQuizFunnel(events)
    expect(f.started).toBe(1)
    expect(f.steps.find((s) => s.stepId === 'personal')?.sessions).toBe(1)
  })

  it('orders steps by where they actually sit in the sequence', () => {
    const f = buildQuizFunnel(journey('s1', STEPS))
    expect(f.steps.map((s) => s.stepId)).toEqual(STEPS)
  })

  it('finds the step losing the most people', () => {
    const events = [
      ...journey('s1', STEPS),
      ...journey('s2', STEPS),
      // Three visitors give up right after the goals question.
      ...journey('s3', ['goals']),
      ...journey('s4', ['goals']),
      ...journey('s5', ['goals']),
      // And one more drops at 'frequency'.
      ...journey('s6', ['goals', 'personal']),
    ]
    const f = buildQuizFunnel(events)
    expect(f.started).toBe(6)
    expect(f.steps[0]).toMatchObject({ stepId: 'goals', sessions: 6, dropped: 0 })
    expect(f.steps[1]).toMatchObject({ stepId: 'personal', sessions: 3, dropped: 3 })
    expect(f.steps[1].dropOffPct).toBeCloseTo(0.5, 2)
    expect(f.worstStep).toMatchObject({ stepId: 'personal', dropped: 3 })
  })

  it('reports the whole journey through to a verified purchase', () => {
    const events = [
      ...journey('s1', STEPS, { complete: true, reveal: true, checkout: true, purchase: true }),
      ...journey('s2', STEPS, { complete: true, reveal: true, checkout: true }),
      ...journey('s3', STEPS, { complete: true, reveal: true }),
      ...journey('s4', ['goals']),
    ]
    const f = buildQuizFunnel(events)
    expect(f.completed).toBe(3)
    expect(f.reachedReveal).toBe(3)
    expect(f.startedCheckout).toBe(2)
    expect(f.purchased).toBe(1)
    expect(f.conversionPct).toBeCloseTo(0.25, 3)
  })

  it('never reports a negative drop when a cohort skips a step', () => {
    // s2 skips 'personal' entirely (a track that doesn't ask it) and is seen again
    // at 'frequency' — which must not read as the step gaining people.
    const events = [
      ...journey('s1', STEPS),
      ev('s2', 'quiz_start'),
      ev('s2', 'quiz_step_view', { stepId: 'goals', index: 0 }),
      ev('s2', 'quiz_step_view', { stepId: 'frequency', index: 2 }),
    ]
    const f = buildQuizFunnel(events)
    for (const s of f.steps) expect(s.dropped).toBeGreaterThanOrEqual(0)
    expect(f.steps.find((s) => s.stepId === 'frequency')?.dropped).toBe(0)
  })

  it('reports median time on a question', () => {
    const events = [
      ...journey('s1', ['goals']),
      ev('s1', 'quiz_step_complete', { stepId: 'goals', index: 0, msOnStep: 4000 }),
      ...journey('s2', ['goals']),
      ev('s2', 'quiz_step_complete', { stepId: 'goals', index: 0, msOnStep: 8000 }),
      ...journey('s3', ['goals']),
      ev('s3', 'quiz_step_complete', { stepId: 'goals', index: 0, msOnStep: 60000 }),
    ]
    expect(buildQuizFunnel(events).steps[0].medianSeconds).toBe(8)
  })

  it('lists where the people who left were last seen', () => {
    const events = [
      ...journey('s1', ['goals', 'personal']),
      ev('s1', 'quiz_abandon', { lastStepId: 'personal', index: 1, msTotal: 9000 }),
      ...journey('s2', ['goals']),
      ev('s2', 'quiz_abandon', { lastStepId: 'goals', index: 0, msTotal: 3000 }),
      ...journey('s3', ['goals']),
      ev('s3', 'quiz_abandon', { lastStepId: 'goals', index: 0, msTotal: 2000 }),
    ]
    expect(buildQuizFunnel(events).abandonedAt).toEqual([
      { stepId: 'goals', sessions: 2 },
      { stepId: 'personal', sessions: 1 },
    ])
  })

  it('is empty rather than broken with no events at all', () => {
    const f = buildQuizFunnel([])
    expect(f.started).toBe(0)
    expect(f.steps).toEqual([])
    expect(f.conversionPct).toBe(0)
    expect(f.worstStep).toBeNull()
  })
})
