/**
 * An item that sold out after the customer paid: swap it, take it off and
 * refund it, or send the rest now and this later.
 *
 * Money is the part these tests are strictest about. Every path must refund
 * exactly the right amount, against the right payment, before the order says it
 * did — and never refund a whole payment that also paid for something else.
 */
import { createOrderFromCheckout } from '@/lib/orders/service'
import {
  backorderLine,
  isSafeReplacement,
  lineOptions,
  refundAmountFor,
  removeLine,
  replacementCandidates,
  safetyWarnings,
  searchReplacements,
  swapLine,
} from '@/lib/orders/line-changes'
import { getOrder, updateOrder } from '@/lib/orders/repo'
import { getByDedupeKey } from '@/lib/notify/outbox'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { OrderLine } from '@/lib/orders/types'
import type { SupplierProductStub, SupplierProvider } from '@/lib/supplier/types'

let mockPaymentSource: 'mock' | 'stripe' = 'mock'
const mockRefund = jest.fn(async () => {})

jest.mock('@/lib/payments', () => ({
  ...jest.requireActual('@/lib/payments'),
  getPaymentSource: () => mockPaymentSource,
}))
jest.mock('@/lib/payments/stripe', () => ({
  refundPaymentAmount: (...args: unknown[]) => mockRefund(...(args as [])),
}))

function variant(sku: string, price: number, available = true): CatalogueVariant {
  return { id: `v-${sku}`, title: sku, flavour: null, size: null, price, compareAtPrice: null, available, inventory: available ? 12 : 0, sku }
}

function product(id: string, sku: string, price: number, over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id,
    title: id,
    swapGroup: 'vitamin-d',
    category: 'Health',
    dietaryTags: ['vegan'],
    hasStimulants: false,
    contraindications: [],
    variants: [variant(sku, price)],
    supplierProductId: `id-${sku}`,
    cost: price / 2,
    weightGrams: null,
    ...over,
  } as unknown as CatalogueProduct
}

const D3_SKU = 'P51016'
const CATALOGUE: CatalogueProduct[] = [
  product('d3', D3_SKU, 8.27, { variants: [variant(D3_SKU, 8.27, false)] }),
  product('d3-cheaper', 'P60001', 7.5),
  product('d3-dearer', 'P60002', 9.99),
  product('d3-not-vegan', 'P60003', 8.2, { dietaryTags: [] }),
  product('d3-caffeinated', 'P60004', 8.27, { hasStimulants: true }),
  product('omega', 'P47499', 19.31, { swapGroup: 'omega' as never, category: 'Health' }),
]

/** PowerBody: everything in stock except what is named. */
function supplier(outOfStock: string[] = [D3_SKU]): SupplierProvider {
  return {
    name: 'powerbody',
    probeProductIds: async (ids: string[]): Promise<SupplierProductStub[]> =>
      ids.map((id) => {
        const sku = id.replace(/^id-/, '')
        const stock = outOfStock.includes(sku) ? 0 : 25
        return { productId: id, sku, name: sku, wholesalePrice: 4, stock, inStock: stock > 0 }
      }),
    getProductsById: async () => [],
    getProductsBySku: async () => [],
  } as unknown as SupplierProvider
}
const deps = (outOfStock?: string[]) => ({ catalogue: CATALOGUE, supplier: supplier(outOfStock) })

const LINES: OrderLine[] = [
  { sku: 'P47499', productId: 'omega', title: 'Super Strong Omega 3', quantity: 1, unitPrice: 19.31, supplierCost: 10.58 },
  { sku: D3_SKU, productId: 'd3', title: 'Vitamin D3 + K2', quantity: 1, unitPrice: 8.27, supplierCost: 4.8 },
]

async function paidOrder(lines = LINES) {
  return createOrderFromCheckout({
    channel: 'quiz',
    email: 'charlie@example.com',
    lines,
    shipping: 2.95,
    shippingAddress: { name: 'Charlie King', line1: '28 Shelley Grove', city: 'Tameside', postcode: 'M43 7YG', country: 'GB' },
    stripePaymentIntentId: 'pi_1',
    status: 'paid',
  })
}

beforeEach(() => {
  mockPaymentSource = 'mock'
  mockRefund.mockClear()
})

describe('choosing a replacement', () => {
  it('offers like-for-like products that keep every promise the original made, nearest price first', async () => {
    const order = await paidOrder()
    const options = replacementCandidates(order, order.lines[1], CATALOGUE)
    expect(options.map((o) => o.productId)).toEqual(['d3-cheaper', 'd3-dearer'])
    expect(options[0]).toMatchObject({ sku: 'P60001', price: 7.5, difference: -0.77 })
  })

  it('never offers something less safe than what they bought', () => {
    const d3 = CATALOGUE[0]
    expect(isSafeReplacement(d3, CATALOGUE[3])).toBe(false) // drops vegan
    expect(isSafeReplacement(d3, CATALOGUE[4])).toBe(false) // adds caffeine
    expect(isSafeReplacement(d3, product('d3-preg', 'P1', 8, { contraindications: ['pregnancy'] as never }))).toBe(false)
    expect(isSafeReplacement(d3, CATALOGUE[1])).toBe(true)
  })

  it('reports live stock for the item and only offers replacements PowerBody can send', async () => {
    const order = await paidOrder()
    const options = await lineOptions(order.id, 1, deps([D3_SKU, 'P60002']))
    expect(options.live).toMatchObject({ sku: D3_SKU, stock: 0 })
    expect(options.replacements.map((r) => r.sku)).toEqual(['P60001'])
    expect(options.replacements[0]).toMatchObject({ confirmed: true, stock: 25 })
    expect(options).toMatchObject({ value: 8.27, onlyLine: false })
  })
})

describe('swapping', () => {
  it('sends the cheaper match, refunds the gap against the payment, and tells the customer', async () => {
    mockPaymentSource = 'stripe'
    const order = await paidOrder()
    const after = await swapLine(order.id, 1, D3_SKU, { productId: 'd3-cheaper', variantId: 'v-P60001' }, { by: 'Lewis' }, deps())

    expect(mockRefund).toHaveBeenCalledWith('pi_1', 0.77, expect.objectContaining({ idempotencyKey: `line-swap:${order.id}:1:P60001` }))
    expect(after.lines[1]).toMatchObject({ sku: 'P60001', productId: 'd3-cheaper', unitPrice: 7.5, quantity: 1 })
    expect(after).toMatchObject({ subtotal: 26.81, total: 29.76, refundedAmount: 0.77 })
    expect(after.events.at(-1)).toMatchObject({ type: 'line_swapped', detail: expect.stringContaining('refunded £0.77') })

    const email = await getByDedupeKey(`order-item-update:${order.id}:swap:1:P60001`)
    expect(email?.rendered.subject).toMatch(/An update on your order/)
    expect(email?.rendered.text).toMatch(/we've refunded £0\.77/)
  })

  it('can update the order without refunding the gap, when the founder says so', async () => {
    mockPaymentSource = 'stripe'
    const order = await paidOrder()
    const after = await swapLine(
      order.id, 1, D3_SKU, { productId: 'd3-cheaper', variantId: 'v-P60001' },
      { refundDifference: false, notify: false }, deps(),
    )
    expect(mockRefund).not.toHaveBeenCalled()
    expect(after.lines[1]).toMatchObject({ sku: 'P60001', unitPrice: 8.27 })
    expect(after.total).toBe(order.total)
    expect(after.refundedAmount ?? 0).toBe(0)
  })

  it('absorbs a dearer match — the customer never pays for our stock problem', async () => {
    mockPaymentSource = 'stripe'
    const order = await paidOrder()
    const after = await swapLine(order.id, 1, D3_SKU, { productId: 'd3-dearer', variantId: 'v-P60002' }, {}, deps())
    expect(mockRefund).not.toHaveBeenCalled()
    expect(after.lines[1]).toMatchObject({ sku: 'P60002', unitPrice: 8.27 })
    expect(after.total).toBe(order.total)
  })

  it('refuses a replacement that is out of stock too, or not as safe, and changes nothing', async () => {
    const order = await paidOrder()
    await expect(
      swapLine(order.id, 1, D3_SKU, { productId: 'd3-cheaper', variantId: 'v-P60001' }, {}, deps([D3_SKU, 'P60001'])),
    ).rejects.toThrow(/out of stock at PowerBody too/)
    await expect(
      swapLine(order.id, 1, D3_SKU, { productId: 'd3-not-vegan', variantId: 'v-P60003' }, {}, deps()),
    ).rejects.toThrow(/does not keep everything/)
    expect((await getOrder(order.id))?.lines[1].sku).toBe(D3_SKU)
  })
})

describe('picking any product by hand', () => {
  it('searches the whole sendable catalogue by name, brand, flavour or code — not only like-for-like', async () => {
    const order = await paidOrder()
    const found = await searchReplacements(order.id, 1, 'p6000', deps())
    expect(found.map((p) => p.productId).sort()).toEqual(['d3-caffeinated', 'd3-cheaper', 'd3-dearer', 'd3-not-vegan'])
    // A different kind of product entirely is fair game too.
    expect((await searchReplacements(order.id, 1, 'omega', deps())).map((p) => p.productId)).toEqual(['omega'])
    // Never the item being replaced, and nothing for an empty search.
    expect((await searchReplacements(order.id, 1, 'd3', deps())).map((p) => p.productId)).not.toContain('d3')
    expect(await searchReplacements(order.id, 1, '  ', deps())).toEqual([])
  })

  it('says, in words, what a hand-picked product does not keep', async () => {
    const order = await paidOrder()
    const [notVegan] = await searchReplacements(order.id, 1, 'd3-not-vegan', deps())
    expect(notVegan.warnings).toEqual(['Not vegan — the original was'])
    expect(safetyWarnings(CATALOGUE[0], CATALOGUE[4])).toEqual(['Contains stimulants — the original did not'])
    expect(notVegan.variants[0]).toMatchObject({ sku: 'P60003', price: 8.2, difference: -0.07 })
  })

  it('sends it anyway once the founder has confirmed, and writes down what they accepted', async () => {
    const order = await paidOrder()
    const after = await swapLine(
      order.id,
      1,
      D3_SKU,
      { productId: 'd3-not-vegan', variantId: 'v-P60003' },
      { acceptWarnings: true, notify: false },
      deps(),
    )
    expect(after.lines[1].sku).toBe('P60003')
    expect(after.events.at(-1)?.detail).toMatch(/chosen despite: Not vegan — the original was/)
  })
})

describe('removing', () => {
  it('takes the item off, refunds exactly that line, and leaves the postage', async () => {
    mockPaymentSource = 'stripe'
    const order = await paidOrder()
    const after = await removeLine(order.id, 1, D3_SKU, { notify: false })

    expect(mockRefund).toHaveBeenCalledWith('pi_1', 8.27, expect.objectContaining({ idempotencyKey: `line-remove:${order.id}:1:${D3_SKU}` }))
    expect(after.lines.map((l) => l.sku)).toEqual(['P47499'])
    expect(after).toMatchObject({ subtotal: 19.31, shipping: 2.95, total: 22.26, refundedAmount: 8.27 })
    // A later full refund refunds what is left, not the original payment.
    expect(refundAmountFor(after)).toBe(22.26)
  })

  it('will not empty an order — that is Refund or Cancel', async () => {
    const order = await paidOrder([LINES[1]])
    await expect(removeLine(order.id, 0, D3_SKU)).rejects.toThrow(/only item/)
  })

  it('refuses before touching the order when there is no payment to refund against', async () => {
    mockPaymentSource = 'stripe'
    const order = await paidOrder()
    await updateOrder(order.id, (o) => {
      o.stripePaymentIntentId = null
    })
    await expect(removeLine(order.id, 1, D3_SKU)).rejects.toThrow(/no card payment/)
    expect((await getOrder(order.id))?.lines).toHaveLength(2)
  })
})

describe('sending the rest now, this later', () => {
  it('moves the item into its own held order sharing the payment, and the rest stays sendable', async () => {
    const order = await paidOrder()
    const { order: parent, backorder } = await backorderLine(order.id, 1, D3_SKU, { by: 'Lewis', notify: false })

    expect(parent.lines.map((l) => l.sku)).toEqual(['P47499'])
    expect(parent).toMatchObject({ subtotal: 19.31, total: 22.26, splitInto: [backorder.id] })
    expect(parent.refundedAmount ?? 0).toBe(0)

    const child = await getOrder(backorder.id)
    expect(child).toMatchObject({
      status: 'paid',
      splitFrom: order.id,
      stripePaymentIntentId: 'pi_1',
      shipping: 0,
      total: 8.27,
      partnerCode: null,
      review: { state: 'held' },
      backorder: { sku: D3_SKU, title: 'Vitamin D3 + K2' },
    })
    expect(child?.lines).toEqual([LINES[1]])
    // Each refunds only its own value from the shared payment.
    expect(refundAmountFor(child!)).toBe(8.27)
    expect(refundAmountFor(parent)).toBe(22.26)
  })

  it('on a one-item order, the order itself waits', async () => {
    const order = await paidOrder([LINES[1]])
    const { order: after, backorder } = await backorderLine(order.id, 0, D3_SKU, { notify: false })
    expect(backorder.id).toBe(order.id)
    expect(after).toMatchObject({ review: { state: 'held' }, backorder: { sku: D3_SKU } })
    expect(after.lines).toHaveLength(1)
  })
})

describe('guards', () => {
  it('changes nothing once PowerBody hold the order, or when the screen is out of date', async () => {
    const order = await paidOrder()
    await expect(removeLine(order.id, 1, 'P99999')).rejects.toThrow(/order changed/)
    await updateOrder(order.id, (o) => {
      o.supplierOrderId = 'PB-1'
      o.status = 'submitted_to_supplier'
    })
    await expect(removeLine(order.id, 1, D3_SKU)).rejects.toThrow(/PowerBody already have this order/)
  })

  it('refunds the whole payment for an ordinary order, exactly as before', async () => {
    const order = await paidOrder()
    expect(refundAmountFor(order)).toBeNull()
  })
})
