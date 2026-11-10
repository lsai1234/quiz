/**
 * @jest-environment node
 */
const mockUser: { current: unknown } = { current: null }
jest.mock('@/lib/auth/session', () => ({ getHubUser: async () => mockUser.current }))
// The Founders Hub's side of the trainer's check, signed in as a founder.
jest.mock('@/lib/portal/guard', () => ({ isPortalAuthed: async () => true, getFounder: async () => ({ email: 'founder@example.com', name: 'Sam Founder' }) }))

import { GET, POST } from '../route'
import { createUser } from '@/lib/db/users'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { saveServiceSettings } from '@/lib/offer/store'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { getTraining } from '@/lib/training/store'
import { deleteAccount, exportAccount } from '@/lib/db/erasure'
import type { TrainingState } from '@/lib/training/state'
import { GET as calendarFeed } from '@/app/api/training/calendar/[token]/route'

process.env.NOTIFY_TEST_ALLOWLIST = '@example.com'
delete process.env.OPENAI_API_KEY

const post = (body: unknown) => POST(new Request('http://x/api/hub/training', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
const json = async (res: Response) => (await res.json()) as TrainingState & { error?: string }

const seed = {
  day: { wake: 420, bed: 1380, trainAt: 1080, trainDays: 3, trainWeekdays: [0, 2, 4], assumed: false },
  goals: ['muscle'],
  firstName: 'sam',
  stackName: null,
  training: { types: ['strength'], experience: 'intermediate', focus: 'hypertrophy' },
}

async function member(email: string, withOrder: boolean) {
  const user = (await createUser({ email, password: 'a-long-password-1' } as never)) as { id: string; email: string }
  if (withOrder) {
    await createOrderFromCheckout({
      channel: 'quiz',
      email,
      status: 'paid',
      lines: MOCK_CATALOGUE.slice(0, 2).map((p) => ({ sku: null, productId: p.id, title: p.id, quantity: 1, unitPrice: 10 })),
      guideSeed: seed as never,
    })
  }
  mockUser.current = user
  return user
}

describe('/api/hub/training', () => {
  afterEach(async () => {
    await saveServiceSettings({ training: false })
  })

  it('needs a signed-in member', async () => {
    mockUser.current = null
    expect((await GET()).status).toBe(401)
    expect((await post({ action: 'ready' })).status).toBe(401)
  })

  it('stays shut while switched off, and for someone with no order', async () => {
    await member('nobody@example.com', false)
    await saveServiceSettings({ training: true })
    const s = await json(await GET())
    expect(s.access).toMatchObject({ enabled: true, allowed: false })
    expect(s.plan).toBeNull()
    expect((await post({ action: 'ready' })).status).toBe(403)

    await member('ordered-off@example.com', true)
    await saveServiceSettings({ training: false })
    expect((await json(await GET())).access).toMatchObject({ enabled: false, allowed: false, via: 'order' })
  })

  it('opens for a one-off order, fills the setup from its answers, and builds a week', async () => {
    const user = await member('lifter@example.com', true)
    await saveServiceSettings({ training: true })
    const s = await json(await GET())
    expect(s.access).toMatchObject({ allowed: true, via: 'order' })
    expect(new Date(s.access.until!).getTime()).toBeGreaterThan(Date.now() + 89 * 86_400_000)
    expect(s.draft).toMatchObject({ days: [0, 2, 4], focus: 'muscle', experience: 'some', equipment: 'gym', trainAt: 1080 })

    // The readiness check comes first, and keeps only that it was done.
    const prefs = { ...s.draft, equipment: 'gym', experience: 'some' }
    expect((await post({ action: 'build', prefs })).status).toBe(409)
    const ready = await json(await post({ action: 'ready', answers: [true, false] }))
    expect(Object.keys(ready.readiness!).sort()).toEqual(['at', 'cleared'])
    expect(JSON.stringify(await getTraining(user.id))).not.toContain('answers')

    const built = await json(await post({ action: 'build', prefs }))
    expect(built.plan?.source).toBe('rules')
    const training = built.plan!.sessions.filter((x) => x.type === 'strength')
    expect(training.map((x) => x.day)).toEqual([0, 2, 4])
    expect(built.plan!.sessions.some((x) => x.type === 'activity' && x.suggested)).toBe(true)
  })

  it('changes the plan a tap at a time, and turns away what doesn’t fit', async () => {
    await member('changer@example.com', true)
    await saveServiceSettings({ training: true })
    await post({ action: 'ready' })
    const s = await json(await GET())
    let state = await json(await post({ action: 'build', prefs: { ...s.draft, equipment: 'gym', experience: 'some' } }))

    state = await json(await post({ action: 'prefs', patch: { days: [0, 1, 3, 4], equipment: 'home' } }))
    expect(state.plan!.sessions.filter((x) => x.type === 'strength').map((x) => x.type === 'strength' && x.template)).toEqual(['upper', 'lower', 'upper', 'lower'])

    state = await json(await post({ action: 'add-activity', day: 6, kind: 'yoga', minutes: 60 }))
    const yoga = state.plan!.sessions.find((x) => x.type === 'activity' && x.activity === 'yoga')!
    expect(yoga.day).toBe(6)

    state = await json(await post({ action: 'done', sessionId: yoga.id, done: true }))
    expect(state.plan!.sessions.find((x) => x.id === yoga.id)?.done).toBe(true)

    const first = state.plan!.sessions.find((x) => x.type === 'strength')!
    expect((await post({ action: 'swap', sessionId: first.id, from: 'nope', to: 'also-nope' })).status).toBe(400)
    expect((await post({ action: 'prefs', patch: { days: [] } })).status).toBe(200) // yoga is still on
    expect((await post({ action: 'prefs', patch: { focus: 'sleep' } })).status).toBe(400)
    expect((await post({ action: 'nonsense' })).status).toBe(400)

    state = await json(await post({ action: 'rebuild-week' }))
    expect(state.plan!.source).toBe('rules')
    state = await json(await post({ action: 'reset' }))
    expect(state.plan).toBeNull()
    expect(state.draft).not.toBeNull()
  })

  it('goes out in the data export and is deleted with the account', async () => {
    const user = await member('leaver@example.com', true)
    await saveServiceSettings({ training: true })
    await post({ action: 'ready' })
    const s = await json(await GET())
    await post({ action: 'build', prefs: { ...s.draft, equipment: 'gym', experience: 'some' } })
    const exported = await exportAccount(user.id)
    expect(exported?.training).toMatchObject({ readiness: { cleared: true }, plan: { userId: user.id } })
    const result = await deleteAccount(user.id)
    expect(result.deleted).toContain('training plan')
    expect((await getTraining(user.id)).plan).toBeNull()
  })
})

describe('the trainer checks every plan', () => {
  afterEach(async () => {
    await saveServiceSettings({ training: false, trainer: false })
  })

  it('a new plan waits for the trainer; small changes keep the tick, a rebuilt week goes back', async () => {
    const { saveTrainerProfile } = await import('@/lib/offer/store')
    const { plansToCheck } = await import('@/lib/training/store')
    const { POST: check } = await import('@/app/api/portal/trainer/plans/route')
    const { getThread } = await import('@/lib/trainer/store')
    const { listNotifications } = await import('@/lib/notify/outbox')
    await saveTrainerProfile({ name: 'Sam', checksPlans: true })
    await saveServiceSettings({ training: true, trainer: true })
    const user = await member(`checked-${Date.now()}@example.com`, true)
    const s = await json(await GET())
    expect(s.trainer).toMatchObject({ name: 'Sam', checksPlans: true })
    await post({ action: 'ready', answers: [false] })
    const built = await json(await post({ action: 'build', prefs: { ...s.draft, equipment: 'gym', experience: 'some' } }))
    expect(built.plan!.check).toMatchObject({ state: 'waiting' })
    expect((await plansToCheck()).some((p) => p.userId === user.id)).toBe(true)

    // A founder ticks it, with a note: it lands in their chat, and they're emailed.
    const res = await check(new Request('http://x', { method: 'POST', body: JSON.stringify({ userId: user.id, note: 'Good week. Keep the first squat sets light.' }) }))
    expect(res.status).toBe(200)
    const after = await json(await GET())
    expect(after.plan!.check).toMatchObject({ state: 'checked' })
    const thread = await getThread(user.id)
    expect(thread!.messages[0]).toMatchObject({ from: 'trainer', about: 'Your training plan', text: 'Good week. Keep the first squat sets light.' })
    expect((await listNotifications({ limit: 300 })).some((n) => n.template === 'trainer-reply' && n.email === user.email)).toBe(true)

    // Moving a session keeps the tick; rebuilding the week sends it back.
    const strength = after.plan!.sessions.find((x) => x.type === 'strength')!
    const moved = await json(await post({ action: 'move', sessionId: strength.id, day: strength.day === 6 ? 5 : 6 }))
    expect(moved.plan!.check!.state).toBe('checked')
    const rebuilt = await json(await post({ action: 'rebuild-week' }))
    expect(rebuilt.plan!.check!.state).toBe('waiting')
  })

  it('leaves plans alone while the trainer doesn’t check them', async () => {
    const { saveTrainerProfile } = await import('@/lib/offer/store')
    await saveTrainerProfile({ name: 'Sam', checksPlans: false })
    await saveServiceSettings({ training: true, trainer: true })
    await member(`unchecked-${Date.now()}@example.com`, true)
    const s = await json(await GET())
    await post({ action: 'ready', answers: [false] })
    const built = await json(await post({ action: 'build', prefs: { ...s.draft, equipment: 'gym', experience: 'some' } }))
    expect(built.plan!.check).toBeUndefined()
  })
})

describe('the coaching tools (Phase 1)', () => {
  afterEach(async () => {
    await saveServiceSettings({ training: false, coaching: false })
  })

  it('rates an exercise, sets a busy week, lightens a session and hands out a live calendar that follows the plan', async () => {
    await saveServiceSettings({ training: true, coaching: true })
    await member(`coach-${Date.now()}@example.com`, true)
    await post({ action: 'ready' })
    let s = await json(await post({ action: 'build', prefs: { days: [0, 2, 4], minutes: 45, focus: 'muscle', split: 'auto', equipment: 'gym', experience: 'some', avoid: [], activities: [], trainAt: 1080 } }))
    expect(s.coaching).toEqual({ coaching: true, video: false, programmes: false })
    const first = s.plan!.sessions.find((x) => x.type === 'strength')!
    const ex = first.type === 'strength' ? first.exercises[0].id : ''

    s = await json(await post({ action: 'felt', exerciseId: ex, felt: 'hard' }))
    expect(s.plan!.felt![ex][0].felt).toBe('hard')
    expect((await post({ action: 'felt', exerciseId: ex, felt: 'meh' })).status).toBe(400)

    s = await json(await post({ action: 'week-mode', kind: 'busy' }))
    expect(s.plan!.weekMode?.kind).toBe('busy')
    s = await json(await post({ action: 'week-mode', kind: null }))
    expect(s.plan!.weekMode).toBeNull()

    s = await json(await post({ action: 'lighter', sessionId: first.id, on: true }))
    expect((s.plan!.sessions.find((x) => x.id === first.id) as { lighter?: unknown }).lighter).toBeTruthy()

    s = await json(await post({ action: 'calendar-link' }))
    expect(s.calendarUrl).toMatch(/\/api\/training\/calendar\/[A-Za-z0-9_-]{32}$/)
    const token = s.calendarUrl!.split('/').pop()!
    const feed = await calendarFeed(new Request(`http://x/api/training/calendar/${token}`), { params: Promise.resolve({ token }) })
    expect(feed.status).toBe(200)
    expect(await feed.text()).toContain('BEGIN:VCALENDAR')

    // A new link stops the old one.
    s = await json(await post({ action: 'calendar-link' }))
    const old = await calendarFeed(new Request(`http://x/api/training/calendar/${token}`), { params: Promise.resolve({ token }) })
    expect(old.status).toBe(404)
    expect(s.calendarUrl).not.toContain(token)

    s = await json(await post({ action: 'intro-seen' }))
    expect(s.plan!.introSeen).toBe(true)
  })
})

describe('programmes and goals (Phase 3)', () => {
  afterEach(async () => {
    await saveServiceSettings({ training: false, coaching: false, programmes: false })
  })

  it('starts a programme and sets a goal only while the switch is on', async () => {
    await saveServiceSettings({ training: true, coaching: true, programmes: false })
    await member(`prog-${Date.now()}@example.com`, true)
    await post({ action: 'ready' })
    let s = await json(await post({ action: 'build', prefs: { days: [0, 2, 4], minutes: 45, focus: 'muscle', split: 'auto', equipment: 'gym', experience: 'some', avoid: [], activities: [], trainAt: 1080 } }))
    expect((await post({ action: 'programme', weeks: 8 })).status).toBe(404)
    expect((await post({ action: 'goal', kind: 'pull-up' })).status).toBe(404)

    await saveServiceSettings({ programmes: true })
    expect((await post({ action: 'programme', weeks: 6 })).status).toBe(400)
    s = await json(await post({ action: 'programme', weeks: 12 }))
    expect(s.plan!.programme).toMatchObject({ weeks: 12, endedOn: null })
    expect(s.coaching?.programmes).toBe(true)

    s = await json(await post({ action: 'goal', kind: 'three-a-week' }))
    expect(s.plan!.goal).toMatchObject({ kind: 'three-a-week', doneOn: null })
    const lift = s.plan!.sessions.flatMap((x) => (x.type === 'strength' ? x.exercises.map((e) => e.id) : [])).find((id) => id !== 'plank')!
    expect((await post({ action: 'goal', kind: 'lift', exerciseId: lift, targetKg: 0 })).status).toBe(400)
    s = await json(await post({ action: 'goal', kind: null }))
    expect(s.plan!.goal).toBeNull()

    // Only a session that's really missed, to the day that's really free.
    expect((await post({ action: 'missed', sessionId: 'nope', to: null })).status).toBe(400)
    s = await json(await post({ action: 'programme-stop' }))
    expect(s.plan!.programme).toBeNull()
  })
})
