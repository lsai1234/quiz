import { useHubStore } from '@/lib/hub-store'
import { createMockSubscription } from '@/lib/recharge/mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { MemberSubscription } from '@/lib/recharge/types'

/**
 * How the hub saves a plan (`hub-store`).
 *
 * Every change shows at once and is saved after. These hold the parts that are
 * easy to break without noticing: saves go one at a time, each made on top of the
 * plan as last stored and sent with its version; a stale version is answered by
 * making the change again on the plan as it now is; and a refused change comes
 * off the screen with a reason, rather than staying there unsaved.
 */

const PLAN: MemberSubscription = createMockSubscription(MOCK_CATALOGUE, 'queue@example.com')

type Reply = { status: number; body: unknown }
let puts: Array<{ subscription: MemberSubscription; version: string | null }>
let putReplies: Array<(sent: { subscription: MemberSubscription; version: string | null }) => Reply>
let storedPlan: MemberSubscription | null
let storedVersion: string

function fetchMock(url: string, init?: RequestInit): Promise<Response> {
  const reply = (r: Reply) => Promise.resolve({ ok: r.status < 400, status: r.status, json: async () => r.body } as Response)
  if (url === '/api/auth/me') return reply({ status: 200, body: { user: { email: 'queue@example.com', name: 'Sam' }, providers: [] } })
  if (url === '/api/hub/subscription' && (!init || !init.method || init.method === 'GET')) {
    return reply({ status: 200, body: { subscription: storedPlan, version: storedVersion, feedback: [] } })
  }
  if (url === '/api/hub/subscription' && init?.method === 'PUT') {
    const sent = JSON.parse(String(init.body))
    puts.push(sent)
    const next = putReplies.shift()
    if (!next) throw new Error('unexpected save')
    return reply(next(sent))
  }
  throw new Error(`unexpected request ${url}`)
}

/** A save that works: the server stores what it's sent under a new version. */
const accept = (sent: { subscription: MemberSubscription }): Reply => {
  storedPlan = sent.subscription
  storedVersion = `v${Number(storedVersion.slice(1)) + 1}`
  return { status: 200, body: { ok: true, version: storedVersion, subscription: storedPlan } }
}

/** Let every queued save and its follow-ups run. */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}

beforeEach(async () => {
  puts = []
  putReplies = []
  storedPlan = PLAN
  storedVersion = 'v1'
  global.fetch = jest.fn(fetchMock) as unknown as typeof fetch
  useHubStore.setState({ session: null, subscription: null, saveError: null, loadProblem: null, hydrated: false })
  await useHubStore.getState().hydrate()
})

afterEach(() => {
  delete (global as { fetch?: unknown }).fetch
})

it('sends each change after the one before has saved, with the version it was given', async () => {
  putReplies.push(accept, accept)
  useHubStore.getState().pause()
  useHubStore.getState().setDispatchDay(20)
  // Both show at once.
  expect(useHubStore.getState().subscription).toMatchObject({ status: 'paused', dispatchDayOfMonth: 20 })
  await settle()

  expect(puts.map((p) => p.version)).toEqual(['v1', 'v2'])
  expect(puts[0].subscription.status).toBe('paused')
  // The second is made on the first as stored, so it carries both.
  expect(puts[1].subscription).toMatchObject({ status: 'paused', dispatchDayOfMonth: 20 })
  expect(useHubStore.getState().subscription).toMatchObject({ status: 'paused', dispatchDayOfMonth: 20 })
  expect(useHubStore.getState().saveError).toBeNull()
})

it('makes a change again on top of a plan that moved on elsewhere, so both stand', async () => {
  // Somewhere else, the plan was paused.
  const elsewhere = { ...PLAN, status: 'paused' as const }
  putReplies.push(
    () => ({ status: 409, body: { code: 'stale', error: 'Changed elsewhere', subscription: elsewhere, version: 'v7' } }),
    (sent) => {
      storedVersion = 'v7'
      return accept(sent)
    },
  )
  useHubStore.getState().setDispatchDay(3)
  await settle()

  expect(puts).toHaveLength(2)
  expect(puts[1].version).toBe('v7')
  expect(puts[1].subscription).toMatchObject({ status: 'paused', dispatchDayOfMonth: 3 })
  expect(useHubStore.getState().subscription).toMatchObject({ status: 'paused', dispatchDayOfMonth: 3 })
  // Nothing went wrong from where the member sits.
  expect(useHubStore.getState().saveError).toBeNull()
})

it('takes a refused change off the screen and says why', async () => {
  putReplies.push(() => ({ status: 502, body: { error: 'We couldn’t update your billing just now.' } }))
  useHubStore.getState().pause()
  expect(useHubStore.getState().subscription?.status).toBe('paused')
  await settle()

  expect(useHubStore.getState().subscription?.status).toBe(PLAN.status)
  expect(useHubStore.getState().saveError).toMatch(/billing/)
})

it('goes on with the next change after one is refused, made on what is stored', async () => {
  putReplies.push(() => ({ status: 400, body: { error: 'Not that one.' } }), accept)
  useHubStore.getState().pause()
  useHubStore.getState().setDispatchDay(12)
  await settle()

  expect(puts).toHaveLength(2)
  // The refused pause isn't carried into the next save.
  expect(puts[1].subscription).toMatchObject({ status: PLAN.status, dispatchDayOfMonth: 12 })
  expect(useHubStore.getState().subscription).toMatchObject({ status: PLAN.status, dispatchDayOfMonth: 12 })
})

describe('loading', () => {
  it('says the plan didn’t load, rather than that there is none', async () => {
    global.fetch = jest.fn(async (url: string) => {
      if (url === '/api/auth/me') return { ok: true, status: 200, json: async () => ({ user: { email: 'a@example.com', name: 'A' } }) }
      return { ok: false, status: 500, json: async () => ({}) }
    }) as unknown as typeof fetch
    useHubStore.setState({ session: null, subscription: null, loadProblem: null, hydrated: false })
    await useHubStore.getState().hydrate()
    expect(useHubStore.getState()).toMatchObject({ subscription: null, loadProblem: 'plan', hydrated: true })
    expect(useHubStore.getState().session).not.toBeNull()
  })

  it('says it couldn’t check the session, rather than that they are signed out', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    useHubStore.setState({ session: null, subscription: null, loadProblem: null, hydrated: false })
    await useHubStore.getState().hydrate()
    expect(useHubStore.getState()).toMatchObject({ session: null, loadProblem: 'session', hydrated: true })
  })

  it('clears the problem once a retry works', async () => {
    useHubStore.setState({ loadProblem: 'plan', subscription: null })
    await useHubStore.getState().refresh()
    expect(useHubStore.getState().loadProblem).toBeNull()
    expect(useHubStore.getState().subscription?.id).toBe(PLAN.id)
  })
})

it('takes a check-in off again, with a reason, when it doesn’t save', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
  useHubStore.setState({ feedback: [] })
  useHubStore.getState().submitDimension('energy' as never, 4)
  expect(useHubStore.getState().feedback).toHaveLength(1)
  await settle()
  expect(useHubStore.getState().feedback).toHaveLength(0)
  expect(useHubStore.getState().saveError).toMatch(/check-in/)
})
