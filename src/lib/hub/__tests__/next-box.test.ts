import {
  extraPrice, extrasDroppedBySkip, extrasFromInvoice, keepStoredExtras, MAX_BOX_EXTRAS, nextBox, planExtra, withExtra, withoutExtra,
} from '../next-box'
import { createMockSubscription } from '@/lib/recharge/mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { MemberSubscription } from '@/lib/recharge/types'

/**
 * Extras for the next box (`next-box.ts`). What these hold: an extra is priced
 * here, goes in the next box only, can't be written or dropped by a saved plan,
 * comes out with a skipped box, and the box a payment raises packs what that
 * payment paid for.
 */

const NOW = new Date('2026-11-24T12:00:00Z')
const plan = (): MemberSubscription => createMockSubscription(MOCK_CATALOGUE, 'extras@example.com', null, NOW)
const addable = MOCK_CATALOGUE.find((p) => p.subscriptionEligible && !p.isSubscriptionOnly && p.variants.some((v) => v.available))!
const variant = addable.variants.find((v) => v.available)!

describe('planning an extra', () => {
  it('goes in the next box, at the plan’s price for that variant', () => {
    const sub = plan()
    const planned = planExtra({ sub, catalogue: MOCK_CATALOGUE, productId: addable.id, variantId: variant.id, now: NOW })
    expect(planned.ok).toBe(true)
    if (!planned.ok) return
    expect(planned.box).toEqual(nextBox(sub, MOCK_CATALOGUE, NOW))
    expect(planned.extra).toMatchObject({ productId: addable.id, variantId: variant.id, price: extraPrice(addable, variant), invoiceItemId: null })
    expect(planned.extra.price).toBeLessThanOrEqual(variant.price)
  })

  it('refuses what it can’t do, each with its reason', () => {
    const sub = plan()
    const ask = (over: Partial<Parameters<typeof planExtra>[0]>) =>
      planExtra({ sub, catalogue: MOCK_CATALOGUE, productId: addable.id, variantId: variant.id, now: NOW, ...over })
    expect(ask({ sub: null })).toEqual({ ok: false, reason: 'no-plan' })
    expect(ask({ sub: { ...sub, status: 'paused' } })).toEqual({ ok: false, reason: 'not-active' })
    expect(ask({ productId: 'no-such-product' })).toEqual({ ok: false, reason: 'unknown-product' })
    const soldOut = MOCK_CATALOGUE.map((p) => (p.id === addable.id ? { ...p, variants: p.variants.map((v) => ({ ...v, available: false })) } : p))
    expect(ask({ catalogue: soldOut })).toEqual({ ok: false, reason: 'sold-out' })
    const subOnly = MOCK_CATALOGUE.map((p) => (p.id === addable.id ? { ...p, isSubscriptionOnly: true } : p))
    expect(ask({ catalogue: subOnly })).toEqual({ ok: false, reason: 'not-for-sale' })
  })

  it('stops at a full box', () => {
    let sub = plan()
    for (let i = 0; i < MAX_BOX_EXTRAS; i++) {
      const p = planExtra({ sub, catalogue: MOCK_CATALOGUE, productId: addable.id, now: NOW })
      if (!p.ok) throw new Error(p.reason)
      sub = withExtra(sub, p.box.id, p.extra)
    }
    expect(planExtra({ sub, catalogue: MOCK_CATALOGUE, productId: addable.id, now: NOW })).toEqual({ ok: false, reason: 'full' })
  })
})

describe('a saved plan and its extras', () => {
  function withOne() {
    const sub = plan()
    const p = planExtra({ sub, catalogue: MOCK_CATALOGUE, productId: addable.id, now: NOW })
    if (!p.ok) throw new Error(p.reason)
    return { sub: withExtra(sub, p.box.id, { ...p.extra, invoiceItemId: 'ii_1' }), boxId: p.box.id, extra: { ...p.extra, invoiceItemId: 'ii_1' } }
  }

  it('keeps the stored extras whatever the browser sends', () => {
    const { sub, boxId, extra } = withOne()
    // A browser that drops the extra, and one that invents another.
    const dropped = { ...sub, deliveryOverrides: { [boxId]: {} } }
    expect(keepStoredExtras(sub, dropped).deliveryOverrides?.[boxId]?.addedItems).toEqual([extra])
    const invented = { ...sub, deliveryOverrides: { [boxId]: { addedItems: [extra, { ...extra, id: 'x-free', price: 0 }] } } }
    expect(keepStoredExtras(sub, invented).deliveryOverrides?.[boxId]?.addedItems).toEqual([extra])
    const otherBox = { ...sub, deliveryOverrides: { ...sub.deliveryOverrides, '2099-01': { addedItems: [extra] } } }
    expect(keepStoredExtras(sub, otherBox).deliveryOverrides?.['2099-01']?.addedItems).toBeUndefined()
  })

  it('takes a skipped box’s extras out, to come off the payment', () => {
    const { sub, boxId, extra } = withOne()
    const skipped = { ...sub, deliveryOverrides: { [boxId]: { ...sub.deliveryOverrides?.[boxId], skipped: true } } }
    const kept = keepStoredExtras(sub, skipped)
    expect(kept.deliveryOverrides?.[boxId]?.addedItems).toBeUndefined()
    expect(extrasDroppedBySkip(sub, kept)).toEqual([extra])
    // Nothing is dropped when nothing new was skipped.
    expect(extrasDroppedBySkip(sub, sub)).toEqual([])
  })

  it('takes one out by id, and says which', () => {
    const { sub, extra } = withOne()
    const { sub: after, removed } = withoutExtra(sub, extra.id)
    expect(removed).toEqual(extra)
    expect(Object.values(after.deliveryOverrides ?? {}).flatMap((o) => o.addedItems ?? [])).toEqual([])
    expect(withoutExtra(sub, 'x-nope').removed).toBeNull()
  })
})

describe('the box a payment raises', () => {
  it('packs the extras that payment paid for, and nothing else on it', () => {
    const lines = extrasFromInvoice(
      [
        { amount: 4999, quantity: 1, description: 'CHRGD Monthly Stack Plan', metadata: {} },
        {
          amount: Math.round(extraPrice(addable, variant) * 100),
          quantity: 1,
          description: `CHRGD — ${addable.title}, added to your next box`,
          metadata: { chrgd_box_extra: '1', chrgd_extra_id: 'x-1', chrgd_product_id: addable.id, chrgd_variant_id: variant.id, chrgd_sku: variant.sku ?? '' },
        },
      ],
      MOCK_CATALOGUE,
    )
    expect(lines).toEqual([
      expect.objectContaining({ productId: addable.id, title: addable.title, quantity: 1, unitPrice: extraPrice(addable, variant), sku: variant.sku ?? null }),
    ])
  })
})
