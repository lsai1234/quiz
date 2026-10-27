/**
 * @jest-environment node
 */
/**
 * /api/cart re-checks the hero and the bonus against the hub's settings as they
 * are now, and says what changed before taking any money.
 */
jest.mock('@/lib/supplier/stock-check', () => ({
  checkLiveStock: async () => ({ ran: true, confirmed: true, shortfalls: [], unconfirmed: [], live: [], error: null }),
}))
jest.mock('@/lib/supplier/sync', () => ({ rememberLiveStock: async () => 0 }))
jest.mock('@/lib/portal/store', () => ({ ...jest.requireActual('@/lib/portal/store'), syncPortalRuntime: async () => {} }))
jest.mock('@/lib/payments', () => ({ ...jest.requireActual('@/lib/payments'), getPaymentSource: () => 'mock' }))
jest.mock('@/lib/partners/referral', () => ({ resolveCheckoutCode: async (typed: string | null) => typed }))
jest.mock('@/lib/catalogue/resolve', () => ({
  getResolvedCatalogue: async () => ({ products: jest.requireActual('@/lib/catalogue/mock-catalogue').MOCK_CATALOGUE }),
}))
// The checkout's bonus line is built (`BONUS_AT_CHECKOUT`); what is tested
// here is the re-check, which stands in front of it either way.
const atCheckout = jest.fn(() => true)
jest.mock('@/lib/offer/public', () => ({ ...jest.requireActual('@/lib/offer/public'), bonusAtCheckout: () => atCheckout() }))

import { POST } from '../route'
import { getOrder } from '@/lib/orders/repo'
import { supplierOrderInputFor } from '@/lib/orders/service'
import { ensureHousePartner } from '@/lib/store-codes'
import { HOUSE_PARTNER_ID } from '@/lib/partners/house'
import * as partners from '@/lib/partners/repo'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { writeJson } from '@/lib/portal/persist'
import { allOn, approved } from '@/lib/offer/__tests__/fixtures'
import { DEFAULT_OFFER } from '@/lib/offer/settings'

const variantOf = (id: string) => MOCK_CATALOGUE.find((p) => p.id === id)!.variants.find((v) => v.available)!.id
const STACK = ['chrgd-whey-protein', 'chrgd-creatine', 'chrgd-pre-workout', 'chrgd-bcaa', 'chrgd-clear-whey']

async function setOffer(settings: unknown) {
  // Through the portal's own writer, so this instance's read cache sees it at once.
  await writeJson('offer', settings)
}

function stack(bonus: unknown, partnerCode: string | null = null) {
  const lines = STACK.map((id) => ({ variantId: variantOf(id), quantity: 1, attributes: [{ key: 'source', value: 'quiz-stack-builder' }] }))
  return POST(new Request('http://localhost/api/cart', { method: 'POST', body: JSON.stringify({ lines, bonus, partnerCode }) }))
}

beforeAll(async () => {
  await ensureHousePartner()
  const open = { firstOrderOnly: false, maxUses: null, uses: 0, startsAt: null, endsAt: null, minSpend: null }
  await partners.createCode({ code: 'BIG25', partnerId: HOUSE_PARTNER_ID, discountPct: 0.25, terms: open })
  await partners.createCode({ code: 'SMALL12', partnerId: HOUSE_PARTNER_ID, discountPct: 0.12, terms: open })
})

afterEach(async () => {
  await setOffer(DEFAULT_OFFER)
})

it('takes the order when the bonus still qualifies', async () => {
  await setOffer({ ...allOn(), heroes: {} })
  const res = await stack({ productId: 'chrgd-vitamin-c-zinc', level: 'complete' })
  expect(res.status).toBe(200)
})

it('refuses the bonus, with nothing charged, while the checkout cannot add it to the order', async () => {
  atCheckout.mockReturnValueOnce(false)
  await setOffer({ ...allOn(), heroes: {} })
  const res = await stack({ productId: 'chrgd-vitamin-c-zinc', level: 'complete' })
  expect(res.status).toBe(409)
  expect(await res.json()).toMatchObject({ bonusChanged: true, reason: 'not-ready' })
})

it('charges exactly the same with the bonus as without it', async () => {
  await setOffer({ ...allOn(), heroes: {} })
  const plain = await getOrder((await (await stack(null)).json()).orderId)
  const withBonus = await getOrder((await (await stack({ productId: 'chrgd-vitamin-c-zinc', level: 'complete' })).json()).orderId)
  expect(withBonus?.total).toBe(plain?.total)
  expect(withBonus?.subtotal).toBe(plain?.subtotal)
  expect(withBonus?.deliveryDue).toEqual(plain?.deliveryDue)
  expect(plain?.total).toBeGreaterThan(0)
})

it('says so before payment when the bonus has been switched off', async () => {
  await setOffer(DEFAULT_OFFER)
  const res = await stack({ productId: 'chrgd-vitamin-c-zinc', level: 'complete' })
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body).toMatchObject({ bonusChanged: true, bonus: null, reason: 'off' })
  expect(body.error).toMatch(/Nothing has been charged/)
})

it('refuses a hero whose approval has been withdrawn', async () => {
  await setOffer({ ...allOn(), heroes: { 'chrgd-magnesium': { ...approved('chrgd-magnesium'), safetyReviewed: false } } })
  const id = 'chrgd-magnesium'
  const res = await POST(
    new Request('http://localhost/api/cart', {
      method: 'POST',
      body: JSON.stringify({
        lines: [{ variantId: variantOf(id), quantity: 1, attributes: [{ key: 'source', value: 'last-chance' }] }],
        lastChance: { variantId: variantOf(id), hero: true },
      }),
    }),
  )
  expect(res.status).toBe(409)
  expect(await res.json()).toMatchObject({ offerChanged: true, heroChanged: true })
})

const GIFT = { productId: 'chrgd-vitamin-c-zinc', level: 'complete' }

it('puts the gift on the order as a £0.00 line, with its cost, and sends it to PowerBody in the same parcel', async () => {
  await setOffer({ ...allOn(), heroes: {} })
  const order = (await getOrder((await (await stack(GIFT)).json()).orderId))!
  const line = order.lines.find((l) => l.bonus)!
  expect(line).toMatchObject({ productId: 'chrgd-vitamin-c-zinc', unitPrice: 0, quantity: 1, bonus: true })
  expect(order.lines.filter((l) => l.bonus)).toHaveLength(1)
  expect(order.bonus).toMatchObject({ productId: 'chrgd-vitamin-c-zinc', status: 'included', level: 'complete' })
  expect(order.bonus!.worth).toBeGreaterThan(0)
  expect(order.events.some((e) => e.type === 'bonus')).toBe(true)
  const toSupplier = await supplierOrderInputFor({ ...order, shippingAddress: { name: 'A', line1: '1 St', city: 'X', postcode: 'AB1 2CD', country: 'GB' } }, order.lines)
  const sent = toSupplier.lines.find((l) => (l.name ?? '').startsWith('Free gift: '))!
  expect(sent).toMatchObject({ quantity: 1, unitPrice: 0 })
})

it('refuses the gift, with nothing charged, when the code is worth more', async () => {
  await setOffer({ ...allOn(), heroes: {} })
  const res = await stack(GIFT, 'BIG25')
  expect(res.status).toBe(409)
  const body = await res.json()
  expect(body).toMatchObject({ bonusChanged: true, reason: 'code' })
  expect(body.error).toMatch(/^Your code is worth more than the free .*, so you’ve got the code\. Nothing has been charged/)
})

it('keeps the gift and drops the code’s discount when the gift is worth more, keeping the referral', async () => {
  await setOffer({ ...allOn(), heroes: {} })
  const plain = (await getOrder((await (await stack(null)).json()).orderId))!
  const order = (await getOrder((await (await stack(GIFT, 'SMALL12')).json()).orderId))!
  expect(order.partnerCode).toBe('SMALL12')
  expect(order.partnerDiscountPct).toBe(0)
  expect(order.bonus?.codeNotApplied).toBe('SMALL12')
  expect(order.total).toBe(plain.total)
})

it('refuses the gift for a founder code', async () => {
  // Founder codes are claimed from what was typed; an unknown one is refused
  // before the gift is looked at, so this checks the rule at its source.
  const { resolveCheckoutBonus } = await import('@/lib/offer/checkout-bonus')
  const r = await resolveCheckoutBonus({
    claim: GIFT,
    settings: allOn(),
    catalogue: MOCK_CATALOGUE,
    lines: STACK.map((id) => {
      const p = MOCK_CATALOGUE.find((x) => x.id === id)!
      return { product: p, price: p.variants[0].price, cost: null, quantity: 1 }
    }),
    constraints: { dietaryTags: [], noStimulants: false, safetyFlags: [] },
    isStack: true,
    code: { kind: 'set-price' },
    customer: {},
    atCheckout: true,
  })
  expect(r).toMatchObject({ ok: false, reason: 'code' })
})
