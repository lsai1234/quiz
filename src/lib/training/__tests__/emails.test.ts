/**
 * @jest-environment node
 */
import { createUser } from '@/lib/db/users'
import { listNotifications } from '@/lib/notify/outbox'
import { saveServiceSettings } from '@/lib/offer/store'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { newPlan } from '../edit'
import { recapEmail, recapFacts, stopByToken, sweepTrainingEmails, todaysSessions, trainingDayEmail } from '../emails'
import { recapDueToday, recapStillDue, remindersOf } from '../reminders'
import { getTraining, saveTraining } from '../store'
import { withLog } from '../progress'
import type { TrainingPrefs } from '../types'

process.env.NOTIFY_TEST_ALLOWLIST = '@example.com'
const DAY = 86_400_000
const prefs: TrainingPrefs = { days: [0, 2, 4], minutes: 45, focus: 'muscle', split: 'auto', equipment: 'gym', experience: 'some', avoid: [], activities: [], trainAt: 18 * 60 }
const links = { open: 'https://x.test/myhub/training', stop: 'https://x.test/myhub/training/emails?stop=t', base: 'https://x.test' }

describe('the switch', () => {
  it('is off unless turned on, and the recap is only offered while it can still go', () => {
    const plan = newPlan('u', prefs, new Date('2026-11-02T09:00:00Z'))
    expect(remindersOf(plan)).toEqual({ days: false, recap: false })
    expect(recapStillDue(plan, new Date('2026-11-10T09:00:00Z'))).toBe(true)
    expect(recapStillDue(plan, new Date('2026-11-17T09:00:00Z'))).toBe(false)
    expect(recapDueToday(plan, new Date('2026-11-08T09:00:00Z'))).toBe(false)
    expect(recapDueToday(plan, new Date('2026-11-09T09:00:00Z'))).toBe(true)
  })
})

describe('what they say', () => {
  it('the training-day email names the session, the time, and has a stop link', () => {
    const now = new Date('2026-11-02T06:00:00Z') // a Monday
    const plan = newPlan('u', prefs, now)
    const today = todaysSessions(plan, now)
    expect(today.length).toBeGreaterThan(0)
    expect(today.every((s) => s.day === 0 && !s.done)).toBe(true)
    const email = trainingDayEmail(today, plan.prefs.trainAt, 'Alex', links)
    expect(email.subject).toMatch(/^Today: /)
    expect(email.text).toContain('6pm')
    expect(email.text).toContain('Stop training emails')
    expect(email.html).toContain(links.stop)
    // Nothing on a rest day; nothing once it's done.
    expect(todaysSessions(plan, new Date('2026-11-03T06:00:00Z'))).toHaveLength(0)
    const done = { ...plan, sessions: plan.sessions.map((s) => ({ ...s, done: s.day === 0 ? true : s.done })) }
    expect(todaysSessions(done, now)).toHaveLength(0)
  })

  it('the recap counts what got done, finds a lift that went up, and never counts what didn’t', () => {
    const start = new Date('2026-11-02T09:00:00Z')
    let plan = newPlan('u', prefs, start)
    const first = plan.sessions.find((s) => s.type === 'strength')!
    const ex = first.type === 'strength' ? first.exercises[0].id : ''
    plan = withLog(plan, ex, { on: '2026-11-02', weightKg: 20, reps: 8 })
    plan = withLog(plan, ex, { on: '2026-11-06', weightKg: 22.5, reps: 8 })
    plan = { ...plan, sessions: plan.sessions.map((s, i) => (i < 2 ? { ...s, done: true } : s)) }
    const facts = recapFacts(plan, new Date('2026-11-09T06:00:00Z'))
    expect(facts.done).toBe(2)
    expect(facts.wentUp).toMatchObject({ from: '20 kg × 8', to: '22.5 kg × 8' })
    expect(facts.since).toBe('2 November')
    const email = recapEmail(facts, 'Sam', 'Alex', links)
    expect(email.text).toContain('2 sessions done.')
    expect(email.text).toContain('Went up:')
    expect(email.text).toContain('Ask Sam')

    const none = recapEmail(recapFacts(newPlan('u', prefs, start), new Date('2026-11-09T06:00:00Z')), null, null, links)
    expect(none.text).toContain('No sessions ticked off yet. Your plan is ready when you are.')
    expect(none.text).not.toMatch(/missed|only|streak/i)
  })
})

describe('the daily job', () => {
  afterAll(async () => saveServiceSettings({ training: false, coaching: false }))

  it('sends only what was turned on, once, while coaching is on, and the stop link stops both', async () => {
    const email = 'training-emails@example.com'
    const user = await createUser({ email, name: 'Jo Bloggs' })
    const product = MOCK_CATALOGUE[0]
    await createOrderFromCheckout({ channel: 'shop', email, userId: user.id, status: 'paid', lines: [{ sku: null, productId: product.id, title: product.title, variantTitle: 'One', quantity: 1, unitPrice: 20 }] } as never)
    const built = new Date(Date.now() - 8 * DAY)
    // Every day a training day, so today always has a session.
    const plan = { ...newPlan(user.id, { ...prefs, days: [0, 1, 2, 3, 4, 5, 6] }, built), reminders: { days: true, recap: true } }
    await saveTraining({ v: 1, userId: user.id, readiness: { cleared: true, at: built.toISOString() } as never, plan })

    const mine = async () => (await listNotifications({ limit: 200 })).filter((n) => n.email === email && n.template.startsWith('training-'))

    // Coaching off: nothing.
    await saveServiceSettings({ training: true, coaching: false })
    await sweepTrainingEmails()
    expect(await mine()).toHaveLength(0)

    await saveServiceSettings({ training: true, coaching: true })
    const first = await sweepTrainingEmails()
    expect(first.days).toBeGreaterThanOrEqual(1)
    expect(first.recaps).toBeGreaterThanOrEqual(1)
    const again = await sweepTrainingEmails()
    expect(again).toEqual({ days: 0, recaps: 0 })
    const sent = await mine()
    expect(sent.filter((n) => n.template === 'training-day')).toHaveLength(1)
    expect(sent.filter((n) => n.template === 'training-recap')).toHaveLength(1)
    expect(sent[0].rendered.html).toContain('/myhub/training/emails?stop=')

    const token = sent[0].rendered.html.match(/stop=([A-Za-z0-9_-]+)/)![1]
    expect(await stopByToken(token)).toBe(true)
    expect(remindersOf((await getTraining(user.id)).plan!)).toEqual({ days: false, recap: false })
    expect(await stopByToken('not-a-real-token-at-all-xx')).toBe(false)
  })
})

describe('what we measure', () => {
  it('counts first sessions, weeks 4 and 12, reorders and plan checks from what is stored', async () => {
    const { measuresFrom } = await import('../measures')
    const now = new Date('2026-11-09T09:00:00Z') // a Monday
    const old = newPlan('a', prefs, new Date('2026-10-05T09:00:00Z'))
    // Week 1 (from 5 Oct) had a session; week 4 (26 Oct) did too; last week (2 Nov) one.
    const a = {
      ...old,
      weekOf: '2026-11-09',
      history: [
        { weekOf: '2026-11-02', done: 1, planned: 3 },
        { weekOf: '2026-10-26', done: 2, planned: 3 },
        { weekOf: '2026-10-19', done: 0, planned: 3 },
        { weekOf: '2026-10-12', done: 3, planned: 3 },
        { weekOf: '2026-10-05', done: 1, planned: 3 },
      ],
      check: { state: 'checked' as const, since: '2026-11-01T09:00:00Z', at: '2026-11-01T20:00:00Z', by: 'f' },
    }
    const b = { ...newPlan('b', prefs, new Date('2026-11-06T09:00:00Z')), check: { state: 'waiting' as const, since: '2026-11-06T09:00:00Z', at: null, by: null } }
    const m = measuresFrom({
      plans: [a, b],
      emails: new Map([['a', 'a@example.com']]),
      orders: [
        { email: 'a@example.com', userId: 'a', createdAt: '2026-09-01T00:00:00Z', channel: 'shop', status: 'paid' },
        { email: 'a@example.com', userId: 'a', createdAt: '2026-10-20T00:00:00Z', channel: 'shop', status: 'paid' },
        { email: 'c@example.com', userId: null, createdAt: '2026-09-01T00:00:00Z', channel: 'quiz', status: 'paid' },
        { email: 'd@example.com', userId: null, createdAt: '2026-11-01T00:00:00Z', channel: 'quiz', status: 'paid' },
      ],
      answers: { answered: 0, withinPromise: 0, promiseHours: 48, rated: 0, helpful: 0 },
      now,
    })
    expect(m.reorder.training).toEqual({ of: 1, n: 1 })
    // d's first order is too recent to count.
    expect(m.reorder.rest).toEqual({ of: 1, n: 0 })
    expect(m.firstSession).toEqual({ of: 1, n: 1 })
    expect(m.week4).toEqual({ of: 1, n: 1 })
    expect(m.week12.of).toBe(0)
    // 6 sessions over 5 plan-weeks: b was there last week too, with none done.
    expect(m.sessionsPerWeek).toBe(1.2)
    expect(m.checks).toEqual({ of: 1, n: 1, waitingOver24h: 1 })
  })
})
