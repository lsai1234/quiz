/**
 * @jest-environment node
 */
const mockUser: { current: unknown } = { current: null }
jest.mock('@/lib/auth/session', () => ({ getHubUser: async () => mockUser.current }))

import { GET, POST } from '../route'
import { createUser } from '@/lib/db/users'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { saveServiceSettings } from '@/lib/offer/store'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { getTraining } from '@/lib/training/store'
import { deleteAccount, exportAccount } from '@/lib/db/erasure'
import type { TrainingState } from '@/lib/training/state'

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
