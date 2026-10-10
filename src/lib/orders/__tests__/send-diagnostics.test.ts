/**
 * "Why won't this order send?" — the diagnosis on the order page.
 *
 * Written because an order sat at FAILED with a timeline line cut off at
 * "PowerBody rejected order ord_b73fd335…", and nothing anywhere could say
 * more. These tests drive a supplier that behaves one particular way and check
 * the diagnosis names that cause — and that it never places anything.
 */
import {
  approveOrderForSupplier,
  createOrderFromCheckout,
  submitOrderToSupplier,
} from '@/lib/orders/service'
import { diagnoseSupplierSend, lastAttemptOf } from '@/lib/orders/send-diagnostics'
import { getOrder, updateOrder } from '@/lib/orders/repo'
import { setSupplierOverride } from '@/lib/supplier'
import { setOrderingOverride } from '@/lib/supplier/ordering'
import { SupplierSendError } from '@/lib/supplier/errors'
import type { OrderLine } from '@/lib/orders/types'
import type { SupplierOrder, SupplierProduct, SupplierProvider } from '@/lib/supplier/types'

const simulatedPlaceOrder = jest.fn()

// Simulate mode places against the mock — stood in for here so a test can make
// a send fail the way the live adapter does.
jest.mock('@/lib/supplier/powerbody/mock', () => ({
  createMockSupplier: () => ({
    name: 'mock',
    getProduct: async () => null,
    getProductsBySku: async () => [],
    sampleSkus: async () => [],
    getStockLevels: async () => [],
    placeOrder: simulatedPlaceOrder,
    getOrder: async () => null,
    listOrders: async () => [],
  }),
}))

// The catalogue holds PowerBody's product id for the creatine — the shortcut the
// diagnosis takes before any SKU search.
jest.mock('@/lib/catalogue/resolve', () => ({
  getResolvedCatalogue: async () => ({
    products: [{ id: 'creatine', weightGrams: null, vatRate: 0.2, supplierProductId: '901' }],
  }),
}))

const SKU = 'P47499'
const LINES: OrderLine[] = [
  { sku: SKU, productId: 'creatine', title: 'Creatine', quantity: 1, unitPrice: 19.31, supplierCost: 10.58 },
]
const ADDRESS = {
  name: 'Sam Taylor',
  line1: '28 Shelley Grove',
  city: 'Tameside',
  postcode: 'M43 7YG',
  country: 'GB',
  phone: '+447931905973',
}

const OLD_REFUSAL = (id: string) =>
  `PowerBody rejected order ${id}: FAIL. Nothing has shipped — fix the order and send it again.`

const ENV_KEYS = ['POWERBODY_API_URL', 'POWERBODY_API_USER', 'POWERBODY_API_KEY'] as const
const originalEnv: Record<string, string | undefined> = {}

function product(sku: string, stock: number, inStock = stock > 0): SupplierProduct {
  return { sku, name: 'Creatine Monohydrate', stock, inStock, wholesalePrice: 10.58 } as SupplierProduct
}

/** A read-only PowerBody stand-in. `placeOrder` throws: a diagnosis must never send. */
function supplier(over: Partial<SupplierProvider> = {}) {
  const placeOrder = jest.fn(async () => {
    throw new Error('a diagnosis must never place an order')
  })
  const provider = {
    name: 'powerbody',
    getProduct: async () => null,
    getProductsById: async (ids: string[]) => (ids.includes('901') ? [product(SKU, 25)] : []),
    getProductsBySku: async () => [],
    sampleSkus: async () => [],
    getStockLevels: async () => [],
    placeOrder,
    updateOrder: placeOrder,
    getOrder: async () => null,
    listOrders: async () => [],
    shippingMethods: async () => [],
    ...over,
  } as unknown as SupplierProvider
  return { provider, placeOrder }
}

async function failedOrder(detail?: (id: string) => string, address = ADDRESS) {
  const order = await createOrderFromCheckout({ channel: 'quiz', email: 'sam@example.com', lines: LINES, shippingAddress: address })
  await approveOrderForSupplier(order.id, 'Test founder')
  await updateOrder(order.id, (o) => {
    o.status = 'failed'
    o.events.push({ at: new Date().toISOString(), type: 'submit_failed', detail: (detail ?? OLD_REFUSAL)(order.id) })
  })
  return order.id
}

const check = (diagnosis: Awaited<ReturnType<typeof diagnoseSupplierSend>>, id: string) => {
  const found = diagnosis?.checks.find((c) => c.id === id)
  if (!found) throw new Error(`no check "${id}"`)
  return found
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key]
    process.env[key] = 'test'
  }
  setSupplierOverride('powerbody')
  setOrderingOverride('live')
  simulatedPlaceOrder.mockReset()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
  setSupplierOverride(null)
  setOrderingOverride(null)
})

describe('diagnoseSupplierSend', () => {
  it('reads an old FAIL off the timeline, and says retry once then ask about DEMO', async () => {
    const id = await failedOrder()
    const { provider, placeOrder } = supplier()
    const diagnosis = await diagnoseSupplierSend(id, { supplier: provider })

    expect(diagnosis?.lastAttemptFromTimeline).toBe(true)
    expect(diagnosis?.lastAttempt).toMatchObject({ ok: false, outcome: 'rejected', code: 'FAIL' })
    expect(check(diagnosis, 'last-answer')).toMatchObject({ status: 'fail' })
    expect(check(diagnosis, 'last-answer').detail).toMatch(/Press Retry/)
    expect(check(diagnosis, `item-${SKU}`).status).toBe('pass')
    expect(diagnosis?.headline.status).toBe('fail')
    expect(diagnosis?.headline.sentence).toMatch(/Press Retry once[\s\S]*DEMO/)
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it('leads with PowerBody’s own reason when they gave one', async () => {
    const id = await failedOrder()
    await updateOrder(id, (o) => {
      o.lastSupplierAttempt = {
        at: new Date().toISOString(),
        ok: false,
        simulated: false,
        outcome: 'rejected',
        code: 'FAIL',
        reason: 'Customer phone number is invalid',
        reply: '{"api_response":"FAIL","message":"Customer phone number is invalid"}',
        request: { id },
        error: 'PowerBody rejected order …',
      }
    })
    const diagnosis = await diagnoseSupplierSend(id, { supplier: supplier().provider })

    expect(diagnosis?.headline.sentence).toMatch(/^PowerBody said: “Customer phone number is invalid”/)
    expect(diagnosis?.lastAttemptFromTimeline).toBe(false)
    expect(check(diagnosis, 'last-answer').evidence).toContain('"message"')
  })

  it('names an out-of-stock item as the cause', async () => {
    const id = await failedOrder()
    const { provider } = supplier({ getProductsById: async () => [product(SKU, 0)] })
    const diagnosis = await diagnoseSupplierSend(id, { supplier: provider })

    expect(check(diagnosis, `item-${SKU}`)).toMatchObject({ status: 'fail' })
    expect(diagnosis?.headline.sentence).toMatch(/Out of stock at PowerBody/)
  })

  it('names an item PowerBody have stopped selling', async () => {
    const id = await failedOrder()
    const { provider } = supplier({ getProductsById: async () => [product(SKU, 12, false)] })
    const diagnosis = await diagnoseSupplierSend(id, { supplier: provider })
    expect(check(diagnosis, `item-${SKU}`).detail).toMatch(/stopped selling/)
  })

  it('says when PowerBody have no product with the code at all', async () => {
    const id = await failedOrder()
    const { provider } = supplier({ getProductsById: async () => [], getProductsBySku: async () => [] })
    const diagnosis = await diagnoseSupplierSend(id, { supplier: provider })
    expect(check(diagnosis, `item-${SKU}`)).toMatchObject({ status: 'fail' })
    expect(check(diagnosis, `item-${SKU}`).detail).toMatch(/no product with this code/)
  })

  it('does not blame an item it could not check', async () => {
    const id = await failedOrder()
    const down = async () => {
      throw new Error('PowerBody did not answer within 20s')
    }
    const { provider } = supplier({ getProductsById: down, getProductsBySku: down })
    const diagnosis = await diagnoseSupplierSend(id, { supplier: provider })
    expect(check(diagnosis, `item-${SKU}`)).toMatchObject({ status: 'warn' })
    expect(check(diagnosis, `item-${SKU}`).detail).toMatch(/Could not be checked[\s\S]*20s/)
  })

  it('uses the catalogue’s product id, and only searches by SKU when that misses', async () => {
    const id = await failedOrder()
    const bySku = jest.fn(async () => [product(SKU, 5)])

    await diagnoseSupplierSend(id, { supplier: supplier({ getProductsBySku: bySku }).provider })
    expect(bySku).not.toHaveBeenCalled()

    // An id whose product carries another SKU is stale — never taken as ours.
    await diagnoseSupplierSend(id, {
      supplier: supplier({ getProductsById: async () => [product('OTHER', 99)], getProductsBySku: bySku }).provider,
    })
    expect(bySku).toHaveBeenCalledWith([SKU])
  })

  it('spots an order PowerBody already hold', async () => {
    const id = await failedOrder()
    const theirs: SupplierOrder = {
      supplierOrderId: 'PB-555',
      reference: id,
      status: 'received',
      lines: [],
      trackingNumber: null,
      updatedAt: new Date().toISOString(),
    }
    const diagnosis = await diagnoseSupplierSend(id, { supplier: supplier({ getOrder: async () => theirs }).provider })
    expect(check(diagnosis, 'already-there')).toMatchObject({ status: 'warn' })
    expect(check(diagnosis, 'already-there').detail).toMatch(/PB-555[\s\S]*Press Retry/)
  })

  it('says so when sends are only simulated', async () => {
    const id = await failedOrder()
    setOrderingOverride('simulate')
    const diagnosis = await diagnoseSupplierSend(id, { supplier: supplier().provider })
    expect(check(diagnosis, 'ordering')).toMatchObject({ status: 'warn' })
  })

  it('flags an address their form cannot take', async () => {
    const id = await failedOrder(undefined, { ...ADDRESS, postcode: 'NOT A CODE', phone: '123' })
    const diagnosis = await diagnoseSupplierSend(id, { supplier: supplier().provider })
    expect(check(diagnosis, 'address')).toMatchObject({ status: 'fail' })
    expect(check(diagnosis, 'address').detail).toMatch(/not a UK postcode/)
  })

  it('shows exactly what a send would carry', async () => {
    const id = await failedOrder()
    const diagnosis = await diagnoseSupplierSend(id, { supplier: supplier().provider })
    expect(diagnosis?.payload).toMatchObject({
      id,
      weight: '',
      transport_code: '',
      address: { name: 'Sam', surname: 'Taylor', postcode: 'M43 7YG', country_code: 'GB' },
      products: [{ sku: SKU, qty: 1, price: 19.31 }],
    })
    expect(check(diagnosis, 'weight')).toMatchObject({ status: 'warn' })
  })

  it('reads an old unreadable reply as unreadable, not as a code', async () => {
    const id = await failedOrder((ref) => `PowerBody rejected order ${ref}: UNKNOWN. Nothing has shipped — fix the order and send it again.`)
    const order = await getOrder(id)
    expect(lastAttemptOf(order!).attempt).toMatchObject({ outcome: 'unreadable', code: null })
  })
})

describe('submitOrderToSupplier keeps the evidence', () => {
  async function approved() {
    const order = await createOrderFromCheckout({ channel: 'quiz', email: 'sam@example.com', lines: LINES, shippingAddress: ADDRESS })
    await approveOrderForSupplier(order.id, 'Test founder')
    return order.id
  }

  beforeEach(() => setOrderingOverride('simulate'))

  it('records what was sent and what came back on a refusal', async () => {
    simulatedPlaceOrder.mockRejectedValueOnce(
      new SupplierSendError('PowerBody rejected order X: FAIL — “Demo account”. Nothing has shipped.', {
        outcome: 'rejected',
        code: 'FAIL',
        reason: 'Demo account',
        reply: '{"api_response":"FAIL","message":"Demo account"}',
        request: { id: 'X', products: [{ sku: SKU }] },
      }),
    )
    const id = await approved()
    await expect(submitOrderToSupplier(id)).rejects.toThrow('Demo account')

    const order = await getOrder(id)
    expect(order?.status).toBe('failed')
    expect(order?.lastSupplierAttempt).toMatchObject({
      ok: false,
      outcome: 'rejected',
      code: 'FAIL',
      reason: 'Demo account',
      reply: '{"api_response":"FAIL","message":"Demo account"}',
      request: { id: 'X', products: [{ sku: SKU }] },
    })
    expect(order?.events.at(-1)).toMatchObject({ type: 'submit_failed', detail: expect.stringContaining('Demo account') })
  })

  it('records a plain error with what it said, and a success as accepted', async () => {
    simulatedPlaceOrder.mockRejectedValueOnce(new Error('catalogue exploded'))
    const id = await approved()
    await expect(submitOrderToSupplier(id)).rejects.toThrow('catalogue exploded')
    expect((await getOrder(id))?.lastSupplierAttempt).toMatchObject({ ok: false, outcome: 'error', error: 'catalogue exploded' })

    simulatedPlaceOrder.mockResolvedValueOnce({ supplierOrderId: 'SIM-1', status: 'received' })
    await submitOrderToSupplier(id)
    expect((await getOrder(id))?.lastSupplierAttempt).toMatchObject({ ok: true, outcome: 'accepted', simulated: true })
  })
})
