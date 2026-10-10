/**
 * Automatic sending. The tests care about the boundary more than the happy
 * path: it must send a clean paid order, and must NOT send anything that needs
 * a judgement — and must say why, where a founder will see it.
 */
import { createOrderFromCheckout, holdOrder } from '@/lib/orders/service'
import { autoSendOrder, sweepAutoSend } from '@/lib/orders/auto-send'
import { getOrder, updateOrder } from '@/lib/orders/repo'
import { setSupplierOverride } from '@/lib/supplier'
import { setAutoSendOverride, setOrderingOverride } from '@/lib/supplier/ordering'
import type { OrderLine } from '@/lib/orders/types'
import type { SupplierProductStub } from '@/lib/supplier/types'

const placeOrder = jest.fn()
const probeProductIds = jest.fn()
const getProductsBySku = jest.fn()
const sendToDevices = jest.fn(async () => ({ sent: 1, failed: 0, removed: 0, notSetUp: false }))

jest.mock('@/lib/supplier/powerbody/live', () => ({
  createPowerBodyProvider: () => ({
    name: 'powerbody',
    getProduct: async () => null,
    getProductsById: async () => [],
    getProductsBySku,
    probeProductIds,
    getStockLevels: async () => [],
    placeOrder,
    getOrder: async () => null,
    listOrders: async () => [],
  }),
  __resetPowerBodyCache: () => {},
}))

jest.mock('@/lib/catalogue/resolve', () => ({
  getResolvedCatalogue: async () => ({
    products: [{ id: 'creatine', weightGrams: null, vatRate: 0.2, supplierProductId: '901' }],
  }),
}))

jest.mock('@/lib/push/send', () => ({ sendToDevices: (...args: unknown[]) => sendToDevices(...(args as [])) }))
jest.mock('@/lib/push/badge', () => ({ reviewCount: async () => 1 }))

const SKU = 'P51016'
const LINES: OrderLine[] = [
  { sku: SKU, productId: 'creatine', title: 'Vitamin D3 + K2', quantity: 1, unitPrice: 8.27, supplierCost: 4.8 },
]
const ADDRESS = { name: 'Charlie King', line1: '28 Shelley Grove', city: 'Tameside', postcode: 'M43 7YG', country: 'GB', phone: '+447931905973' }

const inStock = (stock = 20): SupplierProductStub[] => [{ productId: '901', sku: SKU, name: 'D3', wholesalePrice: 4.8, stock, inStock: stock > 0 }]

const ENV_KEYS = ['POWERBODY_API_URL', 'POWERBODY_API_USER', 'POWERBODY_API_KEY'] as const
const originalEnv: Record<string, string | undefined> = {}

function paidOrder(over: Partial<Parameters<typeof createOrderFromCheckout>[0]> = {}) {
  return createOrderFromCheckout({ channel: 'quiz', email: 'charlie@example.com', lines: LINES, shippingAddress: ADDRESS, status: 'paid', ...over })
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key]
    process.env[key] = 'test'
  }
  setSupplierOverride('powerbody')
  setOrderingOverride('live')
  setAutoSendOverride(true)
  placeOrder.mockReset()
  placeOrder.mockImplementation(async (input: { reference: string }) => ({ supplierOrderId: `PB-${input.reference}`, status: 'received' }))
  probeProductIds.mockReset()
  probeProductIds.mockResolvedValue(inStock())
  getProductsBySku.mockReset()
  getProductsBySku.mockResolvedValue([])
  sendToDevices.mockClear()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
  setSupplierOverride(null)
  setOrderingOverride(null)
  setAutoSendOverride(null)
})

describe('automatic sending', () => {
  it('sends a clean order the moment it is paid', async () => {
    const order = await paidOrder()
    const after = await getOrder(order.id)

    expect(placeOrder).toHaveBeenCalledTimes(1)
    expect(after?.status).toBe('submitted_to_supplier')
    expect(after?.autoSend).toMatchObject({ outcome: 'sent' })
    expect(after?.review).toMatchObject({ state: 'approved', by: 'Automatic sending' })
  })

  it('holds an order with an out-of-stock item, says why, and tells the founders', async () => {
    probeProductIds.mockResolvedValue(inStock(0))
    const order = await paidOrder()
    const after = await getOrder(order.id)

    expect(placeOrder).not.toHaveBeenCalled()
    expect(after?.status).toBe('paid')
    expect(after?.review?.state).toBe('pending')
    expect(after?.review?.note).toMatch(/^Not sent automatically: Vitamin D3 \+ K2 \(P51016\) is out of stock at PowerBody/)
    expect(after?.events.at(-1)).toMatchObject({ type: 'auto_send_held' })
    expect(sendToDevices).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/needs you/) }))
  })

  it('fails closed when PowerBody cannot confirm the stock', async () => {
    probeProductIds.mockRejectedValue(new Error('PowerBody is rate limiting us (HTTP 429).'))
    getProductsBySku.mockRejectedValue(new Error('PowerBody is rate limiting us (HTTP 429).'))
    const order = await paidOrder()
    const after = await getOrder(order.id)

    expect(placeOrder).not.toHaveBeenCalled()
    expect(after?.autoSend?.reasons[0]).toMatch(/Could not confirm stock at PowerBody for P51016/)
  })

  it('holds an item with no PowerBody code rather than quietly dropping it', async () => {
    const order = await paidOrder({ lines: [...LINES, { sku: null, productId: 'x', title: 'Shaker', quantity: 1, unitPrice: 5 }] })
    expect(placeOrder).not.toHaveBeenCalled()
    expect((await getOrder(order.id))?.autoSend?.reasons).toContain('Shaker has no PowerBody code')
  })

  it('does nothing when switched off, or while sends are simulated', async () => {
    setAutoSendOverride(false)
    const off = await paidOrder()
    setAutoSendOverride(true)
    setOrderingOverride('simulate')
    const simulated = await paidOrder()

    expect(placeOrder).not.toHaveBeenCalled()
    expect((await getOrder(off.id))?.autoSend).toBeUndefined()
    expect((await getOrder(simulated.id))?.autoSend).toBeUndefined()
  })

  it('acts once — a second trigger leaves the order alone', async () => {
    probeProductIds.mockResolvedValue(inStock(0))
    const order = await paidOrder()
    probeProductIds.mockResolvedValue(inStock(20))

    expect(await autoSendOrder(order.id)).toMatchObject({ outcome: 'skipped' })
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it('leaves free orders and orders a founder already decided on to the founder', async () => {
    const free = await paidOrder({ founderCode: 'FH-FREE-1', founderCodeKind: 'free', lines: LINES.map((l) => ({ ...l, unitPrice: 0 })) })
    expect(placeOrder).not.toHaveBeenCalled()
    expect((await getOrder(free.id))?.autoSend).toBeUndefined()

    setAutoSendOverride(false)
    const held = await paidOrder()
    await holdOrder(held.id, 'Founder', 'Checking the address')
    setAutoSendOverride(true)
    expect(await autoSendOrder(held.id)).toMatchObject({ outcome: 'skipped', reason: 'Review is held.' })
  })

  it('records a refusal from PowerBody and tells the founders', async () => {
    placeOrder.mockRejectedValue(new Error('PowerBody rejected order X: FAIL (they gave no reason).'))
    const order = await paidOrder()
    const after = await getOrder(order.id)

    expect(after?.status).toBe('failed')
    expect(after?.autoSend).toMatchObject({ outcome: 'failed', reasons: [expect.stringMatching(/FAIL/)] })
    expect(sendToDevices).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/refused/) }))
  })
})

describe('a send cut off mid-way', () => {
  it('is retried once its claim has gone stale, and not before', async () => {
    setAutoSendOverride(false)
    const since = new Date().toISOString()
    await new Promise((r) => setTimeout(r, 5))
    const order = await paidOrder()
    setAutoSendOverride(true, since)
    await updateOrder(order.id, (o) => {
      o.autoSend = { at: new Date().toISOString(), outcome: 'sending', reasons: [] }
    })
    const later = new Date(Date.now() + 10 * 60 * 1000)
    expect(await sweepAutoSend({ now: later })).toMatchObject({ sent: 0 })

    await updateOrder(order.id, (o) => {
      o.autoSend = { at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), outcome: 'sending', reasons: [] }
    })
    expect(await sweepAutoSend({ now: later })).toMatchObject({ sent: 1 })
    expect((await getOrder(order.id))?.status).toBe('submitted_to_supplier')
  })
})

describe('the daily sweep', () => {
  it('sends what the trigger missed, but not a backlog from before the switch, nor the last few minutes', async () => {
    setAutoSendOverride(false)
    const before = await paidOrder()
    const since = new Date(Date.now() + 1).toISOString()
    await new Promise((r) => setTimeout(r, 5))
    const missed = await paidOrder()
    setAutoSendOverride(true, since)

    // Too fresh: its own trigger is presumed to be running.
    expect(await sweepAutoSend()).toMatchObject({ sent: 0 })

    const later = new Date(Date.now() + 10 * 60 * 1000)
    expect(await sweepAutoSend({ now: later })).toMatchObject({ sent: 1 })
    expect((await getOrder(missed.id))?.status).toBe('submitted_to_supplier')
    expect((await getOrder(before.id))?.status).toBe('paid')
  })

  it('sends a back-order once its item is back, or says so when sending is by hand', async () => {
    setAutoSendOverride(false)
    const order = await paidOrder()
    await updateOrder(order.id, (o) => {
      o.backorder = { sku: SKU, title: 'Vitamin D3 + K2', since: new Date().toISOString() }
      o.review = { state: 'held', note: 'Waiting for stock' }
    })

    probeProductIds.mockResolvedValue(inStock(0))
    expect(await sweepAutoSend()).toMatchObject({ backordersReleased: 0 })

    probeProductIds.mockResolvedValue(inStock(5))
    expect(await sweepAutoSend()).toMatchObject({ backordersReleased: 1 })
    expect((await getOrder(order.id))?.review?.note).toBe('Back in stock at PowerBody — ready to send.')
    expect(placeOrder).not.toHaveBeenCalled()

    // With automatic sending on, the sweep approves and sends it itself.
    setAutoSendOverride(true)
    expect(await sweepAutoSend()).toMatchObject({ backordersReleased: 1 })
    expect((await getOrder(order.id))?.status).toBe('submitted_to_supplier')
  })
})
