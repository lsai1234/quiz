/**
 * @jest-environment node
 */
const mockUser: { current: unknown } = { current: null }
jest.mock('@/lib/auth/session', () => ({ getHubUser: async () => mockUser.current }))

import { GET, PUT } from '../route'
import { createUser } from '@/lib/db/users'
import { getSubscription, saveQuiz, saveSubscription } from '@/lib/db/hub-data'
import { hubAccess } from '@/lib/hub/access'
import { createMockSubscription, pauseSubscription, setDispatchDay } from '@/lib/recharge/mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { MemberSubscription } from '@/lib/recharge/types'

/**
 * Saving a plan from the hub.
 *
 * What these hold: the route changes a plan and never makes one (it used to
 * save whatever it was sent into an empty account, which opened the whole hub
 * for £0), and a change made to a plan that has since moved on is refused with
 * the plan as it now is, rather than saved over it.
 */

const put = (body: unknown) =>
  PUT(new Request('http://x/api/hub/subscription', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
const read = async () => (await (await GET()).json()) as { subscription: MemberSubscription | null; version: string | null }

let n = 0
async function member(withPlan: boolean) {
  const user = await createUser({ email: `plan-route-${++n}@example.com` })
  mockUser.current = user
  if (withPlan) await saveSubscription(user.id, createMockSubscription(MOCK_CATALOGUE, user.email ?? ''))
  return user
}

describe('/api/hub/subscription', () => {
  // Demo plans would fill the empty accounts these are about.
  const demo = process.env.HUB_DEMO_SUBSCRIPTION
  beforeAll(() => {
    process.env.HUB_DEMO_SUBSCRIPTION = 'off'
  })
  afterAll(() => {
    process.env.HUB_DEMO_SUBSCRIPTION = demo
  })

  it('needs a signed-in member', async () => {
    mockUser.current = null
    expect((await GET()).status).toBe(401)
    expect((await put({ subscription: { lines: [] } })).status).toBe(401)
  })

  it('never makes a plan: an account without one cannot save itself one', async () => {
    const user = await member(false)
    const free = { ...createMockSubscription(MOCK_CATALOGUE, user.email ?? ''), flatMonthly: 0 }
    const res = await put({ subscription: free })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'no-plan' })
    expect(await getSubscription(user.id)).toBeNull()
    expect((await hubAccess(user)).state).toBe('none')
  })

  it('reads the empty document a quiz leaves before checkout as no plan', async () => {
    const user = await member(false)
    await saveQuiz(user.id, { answers: { goals: ['muscle'] } })
    expect(await getSubscription(user.id)).toBeNull()
    // It used to read back as a plan with no status, which the access rule took for a subscriber.
    expect((await hubAccess(user)).state).toBe('none')
    expect((await read()).subscription).toBeNull()
    expect((await put({ subscription: createMockSubscription(MOCK_CATALOGUE, user.email ?? '') })).status).toBe(409)
  })

  it('saves a change made to the plan as stored, and answers with the new version', async () => {
    await member(true)
    const { subscription, version } = await read()
    expect(version).toEqual(expect.any(String))

    const res = await put({ subscription: pauseSubscription(subscription!), version })
    expect(res.status).toBe(200)
    const saved = (await res.json()) as { version: string; subscription: MemberSubscription }
    expect(saved.subscription.status).toBe('paused')
    expect(saved.version).not.toBe(version)

    // The version handed back is the one the next read gives.
    expect((await read()).version).toBe(saved.version)
  })

  it('refuses a change made to a plan that has moved on, and sends the plan as it is now', async () => {
    await member(true)
    const { subscription, version } = await read()
    // One window pauses...
    const first = (await (await put({ subscription: pauseSubscription(subscription!), version })).json()) as { version: string }

    // ...and another, still showing the plan as it was, moves the day.
    const res = await put({ subscription: setDispatchDay(subscription!, 20), version })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { code: string; version: string; subscription: MemberSubscription }
    expect(body.code).toBe('stale')
    expect(body.version).toBe(first.version)
    expect(body.subscription.status).toBe('paused')

    // Nothing was saved over the pause.
    const now = await read()
    expect(now.subscription!.status).toBe('paused')
    expect(now.subscription!.dispatchDayOfMonth).toBe(subscription!.dispatchDayOfMonth)

    // Made again on top of the plan as it is, it saves, and both changes stand.
    const again = await put({ subscription: setDispatchDay(body.subscription, 20), version: body.version })
    expect(again.status).toBe(200)
    const both = await read()
    expect(both.subscription).toMatchObject({ status: 'paused', dispatchDayOfMonth: 20 })
  })

  it('still saves for a client that sends no version', async () => {
    await member(true)
    const { subscription } = await read()
    expect((await put({ subscription: setDispatchDay(subscription!, 9) })).status).toBe(200)
    expect((await read()).subscription!.dispatchDayOfMonth).toBe(9)
  })
})
