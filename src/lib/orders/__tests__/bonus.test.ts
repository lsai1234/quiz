/**
 * The free bonus on orders (plan Phase 4): in a subscription's first box only,
 * and taken off a paid order whose customer has ordered before (first order
 * only, one per customer), with one email to say so.
 */
import { createOrderFromCheckout, createSubscriptionOrder, markOrderPaid } from '@/lib/orders/service'
import { getOrder } from '@/lib/orders/repo'
import { writeJson } from '@/lib/portal/persist'
import { listNotifications } from '@/lib/notify/outbox'
import type { OrderLine } from '@/lib/orders/types'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { allOn } from '@/lib/offer/__tests__/fixtures'

const CATALOGUE = [
  { id: 'protein', cost: 18, variants: [{ id: 'v1', sku: 'SKU-PROTEIN', available: true, price: 36.54 }] },
] as unknown as CatalogueProduct[]

const gift = {
  productId: 'chrgd-vitamin-c-zinc',
  variantId: 'v-c',
  sku: 'SKU-C',
  title: 'CHRGD Vitamin C + Zinc',
  variantTitle: null,
  worth: 11.99,
  supplierCost: 3.2,
  weightGrams: 120,
  level: 'complete',
}

const sub = {
  id: 'sub_b',
  customerEmail: 'member@example.com',
  status: 'active',
  flatMonthly: 36.54,
  monthsActive: 0,
  minMonths: 1,
  lines: [{ id: 'l1', productId: 'protein', productTitle: 'Protein', variantTitle: '', slotTitle: 'Protein', stackSlot: 'protein', quantity: 1, pricePerDelivery: 36.54, deliveryIntervalMonths: 1, deliveriesMade: 0, joinedAtMonth: 0 } as MemberSubscriptionLine],
  bonus: gift,
} as unknown as MemberSubscription

describe('on a subscription', () => {
  it('ships in the first box, at £0.00, with its cost', async () => {
    const order = await createSubscriptionOrder({ id: 'ord_inv_first', sub, catalogue: CATALOGUE, cycle: 0 })
    const line = order.lines.find((l) => l.bonus)!
    expect(line).toMatchObject({ productId: gift.productId, unitPrice: 0, supplierCost: 3.2, quantity: 1 })
    expect(order.bonus).toMatchObject({ productId: gift.productId, status: 'included' })
    expect(order.subtotal).toBe(36.54)
  })

  it('never in a renewal', async () => {
    const order = await createSubscriptionOrder({ id: 'ord_inv_second', sub, catalogue: CATALOGUE, cycle: 1 })
    expect(order.lines.some((l) => l.bonus)).toBe(false)
    expect(order.bonus ?? null).toBeNull()
  })
})

describe('first order only, caught when a guest pays', () => {
  const LINES: OrderLine[] = [
    { sku: 'A', productId: 'a', title: 'A', quantity: 1, unitPrice: 40, supplierCost: 10 },
    { sku: 'C', productId: gift.productId, title: gift.title, quantity: 1, unitPrice: 0, supplierCost: 3.2, bonus: true },
  ]
  const record = { productId: gift.productId, title: gift.title, worth: 11.99, level: 'complete', status: 'included' as const }

  beforeAll(async () => {
    await writeJson('offer', allOn())
  })

  it('keeps the gift for a first order', async () => {
    const pending = await createOrderFromCheckout({ channel: 'quiz', status: 'pending_payment', lines: LINES, bonus: record })
    const paid = (await markOrderPaid(pending.id, { email: 'new@example.com' }))!
    expect(paid.lines.some((l) => l.bonus)).toBe(true)
    expect(paid.bonus?.status).toBe('included')
  })

  it('takes it off for somebody who has ordered before, and emails them once', async () => {
    await createOrderFromCheckout({ channel: 'shop', email: 'again@example.com', lines: [LINES[0]] })
    const pending = await createOrderFromCheckout({ channel: 'quiz', status: 'pending_payment', lines: LINES, bonus: record })
    const paid = (await markOrderPaid(pending.id, { email: 'again@example.com' }))!
    expect(paid.lines.some((l) => l.bonus)).toBe(false)
    expect(paid.bonus).toMatchObject({ status: 'withheld' })
    expect(paid.total).toBe(40)
    expect((await getOrder(pending.id))!.events.some((e) => e.type === 'bonus' && /withheld/.test(e.detail ?? ''))).toBe(true)
    const emails = (await listNotifications({})).filter((n) => n.email === 'again@example.com' && n.dedupeKey === `bonus-withheld:${pending.id}`)
    expect(emails).toHaveLength(1)
    // A redelivered webhook changes nothing and sends nothing more.
    await markOrderPaid(pending.id, { email: 'again@example.com' })
    expect((await listNotifications({})).filter((n) => n.dedupeKey === `bonus-withheld:${pending.id}`)).toHaveLength(1)
  })
})
