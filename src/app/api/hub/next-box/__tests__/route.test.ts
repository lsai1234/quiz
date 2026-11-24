/**
 * @jest-environment node
 */
const mockUser: { current: unknown } = { current: null }
jest.mock('@/lib/auth/session', () => ({ getHubUser: async () => mockUser.current }))

import { GET, POST, DELETE } from '../route'
import { PUT } from '../../subscription/route'
import { createUser } from '@/lib/db/users'
import { getStoredPlan, saveSubscription } from '@/lib/db/hub-data'
import { createMockSubscription } from '@/lib/recharge/mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import type { MemberSubscription } from '@/lib/recharge/types'

/** Extras for the next box, through the route the shop and the hub call (mock payments: nothing to charge). */

const addable = MOCK_CATALOGUE.find((p) => p.subscriptionEligible && !p.isSubscriptionOnly && p.variants.some((v) => v.available))!
const post = (body: unknown) => POST(new Request('http://x/api/hub/next-box', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
const extrasOf = (sub: MemberSubscription | undefined) => Object.values(sub?.deliveryOverrides ?? {}).flatMap((o) => o.addedItems ?? [])

let n = 0
async function member(withPlan = true) {
  const user = await createUser({ email: `next-box-${++n}@example.com` })
  mockUser.current = user
  if (withPlan) await saveSubscription(user.id, createMockSubscription(MOCK_CATALOGUE, user.email ?? ''))
  return user
}

it('needs a signed-in member with a plan', async () => {
  mockUser.current = null
  expect((await post({ productId: addable.id })).status).toBe(401)
  expect((await GET(new Request('http://x/api/hub/next-box'))).status).toBe(401)
  await member(false)
  const res = await post({ productId: addable.id })
  expect(res.status).toBe(409)
  expect(await res.json()).toMatchObject({ reason: 'no-plan' })
  // The shop asks, and is told there's no plan: it offers a monthly basket instead.
  expect(await (await GET(new Request(`http://x/api/hub/next-box?productId=${addable.id}`))).json()).toMatchObject({ plan: null, quote: null, refusal: { reason: 'no-plan' } })
})

it('quotes, adds to the next box, and takes it out again', async () => {
  const user = await member()
  const answer = await (await GET(new Request(`http://x/api/hub/next-box?productId=${addable.id}`))).json()
  expect(answer.plan).toMatchObject({ status: 'active', nextBox: { id: expect.any(String), date: expect.any(String) }, productIds: expect.any(Array) })
  expect(answer.refusal).toBeNull()
  const quote = answer.quote
  expect(quote).toMatchObject({ box: { id: expect.any(String), date: expect.any(String) }, price: expect.any(Number) })

  const added = await post({ productId: addable.id })
  expect(added.status).toBe(200)
  const body = await added.json()
  expect(body.extra).toMatchObject({ productId: addable.id, price: quote.price })
  expect(body.said).toMatch(/^Added to your box on /)
  const stored = (await getStoredPlan(user.id))!
  expect(extrasOf(stored.subscription)).toHaveLength(1)
  expect(stored.version).toBe(body.version)

  const out = await DELETE(new Request(`http://x/api/hub/next-box?id=${body.extra.id}`, { method: 'DELETE' }))
  expect(out.status).toBe(200)
  expect(extrasOf((await getStoredPlan(user.id))!.subscription)).toHaveLength(0)
})

it('can’t be written or dropped by saving the whole plan', async () => {
  const user = await member()
  const { extra } = await (await post({ productId: addable.id })).json()
  const stored = (await getStoredPlan(user.id))!
  const boxId = Object.keys(stored.subscription.deliveryOverrides ?? {})[0]
  // A browser that drops it, and adds a free one of its own.
  const tampered = { ...stored.subscription, deliveryOverrides: { [boxId]: { addedItems: [{ ...extra, id: 'x-free', price: 0 }] } } }
  const res = await PUT(new Request('http://x/api/hub/subscription', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: tampered, version: stored.version }) }))
  expect(res.status).toBe(200)
  expect(extrasOf((await getStoredPlan(user.id))!.subscription).map((x) => x.id)).toEqual([extra.id])
})
