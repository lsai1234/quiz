/**
 * @jest-environment node
 */
/**
 * A member's deal or top-up box, bought from their hub: members only, their own
 * open deals (and ones due within 30 days alongside), priced by the server
 * against the floor, no codes, and held while a checkout is open.
 */
jest.mock('@/lib/supplier/stock-check', () => ({
  checkLiveStock: async () => ({ ran: true, confirmed: true, shortfalls: [], unconfirmed: [], live: [], error: null }),
}))
jest.mock('@/lib/supplier/sync', () => ({ rememberLiveStock: async () => 0 }))
jest.mock('@/lib/portal/store', () => ({ ...jest.requireActual('@/lib/portal/store'), syncPortalRuntime: async () => {} }))
jest.mock('@/lib/payments', () => ({ ...jest.requireActual('@/lib/payments'), getPaymentSource: () => 'mock' }))
const mockUser = { current: null as null | { id: string; email: string } }
jest.mock('@/lib/auth/session', () => ({ getHubUser: async () => mockUser.current }))

import { POST } from '../route'
import { getOrder, saveOrder } from '@/lib/orders/repo'
import { getEngine } from '@/lib/db/engine'
import { createUser } from '@/lib/db/users'
import { createOrderFromCheckout } from '@/lib/orders/service'
import { saveServiceSettings, saveMemberDealSettings } from '@/lib/offer/store'
import { MOCK_CATALOGUE } from '@/lib/catalogue'
import { dealPreview, variantFor } from '@/lib/deals/engine'
import { dealsFor } from '@/lib/deals/server'
import { quoteBox } from '@/lib/deals/box'
import { DEFAULT_MEMBER_DEALS } from '@/lib/offer/settings'

process.env.NOTIFY_TEST_ALLOWLIST = '@example.com'
const DAY = 86_400_000
const withDeal = MOCK_CATALOGUE.filter((p) => dealPreview(p, null))
const [A, B] = withDeal
const variantOf = (p: (typeof MOCK_CATALOGUE)[number]) => variantFor(p, null)!

async function member(email: string, products: typeof MOCK_CATALOGUE, daysAgo: number) {
  const user = (await createUser({ email, password: 'a-long-password-1' } as never)) as { id: string; email: string }
  const order = await createOrderFromCheckout({
    channel: 'quiz',
    email,
    status: 'paid',
    lines: products.map((p) => ({ sku: null, productId: p.id, title: p.title, variantTitle: variantOf(p).title, quantity: 1, unitPrice: variantOf(p).price })),
  })
  // Bought `daysAgo`, so its deal has opened.
  const db = await getEngine()
  await db.run('DELETE FROM orders WHERE id = ?', [order.id])
  await saveOrder({ ...order, createdAt: new Date(Date.now() - daysAgo * DAY).toISOString() })
  mockUser.current = user
  return user
}

const buy = (variantIds: string[], memberDeal: unknown, extra: Record<string, unknown> = {}) =>
  POST(
    new Request('http://localhost/api/cart', {
      method: 'POST',
      body: JSON.stringify({ lines: variantIds.map((variantId) => ({ variantId, quantity: 1, attributes: [{ key: 'source', value: 'hub-deal' }] })), memberDeal, ...extra }),
    }),
  )

describe('member deals at the checkout', () => {
  beforeAll(async () => {
    await saveServiceSettings({ deals: true })
    await saveMemberDealSettings({ ...DEFAULT_MEMBER_DEALS })
  })
  afterAll(async () => saveServiceSettings({ deals: false }))

  it('is for signed-in members only', async () => {
    mockUser.current = null
    expect((await buy([variantOf(A).id], {})).status).toBe(401)
  })

  it('sells an open deal at exactly the price the hub shows, and records it', async () => {
    const user = await member('deal-buyer@example.com', [A], 85)
    const state = await dealsFor(user)
    const deal = state.deals.find((d) => d.productId === A.id)!
    expect(deal.state).toBe('open')
    const res = await buy([deal.variantId], { expectedTotal: deal.quote.total })
    expect(res.status).toBe(200)
    const { orderId } = (await res.json()) as { orderId: string }
    const order = (await getOrder(orderId))!
    expect(order.memberDeal?.total).toBe(deal.quote.total)
    expect(order.memberDeal?.lines[0]).toMatchObject({ productId: A.id, boughtOn: deal.boughtOn })
    expect(order.total).toBe(deal.quote.total)
    // Used: the deal now follows the new pack, so it isn't open any more.
    const after = await dealsFor(user)
    expect(after.deals.find((d) => d.productId === A.id)?.state).toBe('upcoming')
  })

  it('turns away a product they never bought, or a deal that isn’t open yet', async () => {
    await member('not-mine@example.com', [A], 85)
    expect((await buy([variantOf(B).id], {})).status).toBe(409)
    await member('too-soon@example.com', [A], 1)
    expect((await buy([variantOf(A).id], {})).status).toBe(409)
  })

  it('prices a top-up box on the server, and refuses to charge more than was shown', async () => {
    const user = await member('box-buyer@example.com', [A, B], 85)
    const box = quoteBox([A, B].map((p) => ({ product: p, variant: variantOf(p) })), DEFAULT_MEMBER_DEALS)
    expect(box.viable).toBe(true)
    expect(box.contribution).toBeGreaterThanOrEqual(box.floor)
    expect((await buy([variantOf(A).id, variantOf(B).id], { expectedTotal: box.total - 1 })).status).toBe(409)
    const res = await buy([variantOf(A).id, variantOf(B).id], { expectedTotal: box.total })
    expect(res.status).toBe(200)
    const order = (await getOrder(((await res.json()) as { orderId: string }).orderId))!
    expect(order.memberDeal?.lines.map((l) => l.productId).sort()).toEqual([A.id, B.id].sort())
    expect(order.total).toBe(box.goods)
    void user
  })

  it('takes no code and no gift alongside', async () => {
    await member('no-codes@example.com', [A], 85)
    expect((await buy([variantOf(A).id], {}, { bonus: { productId: 'x' } })).status).toBe(400)
  })
})
