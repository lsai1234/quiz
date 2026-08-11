/**
 * The simulate/live gate on sending orders.
 *
 * These tests care about one thing: that `submitOrderToSupplier` cannot reach
 * the real supplier unless ordering has been explicitly armed. The gate lives in
 * the orders domain rather than in the route, so this is where it is proven.
 */
import { createOrderFromCheckout, approveOrderForSupplier, submitOrderToSupplier, syncSupplierStatus } from '@/lib/orders/service'
import { setSupplierOverride } from '@/lib/supplier'
import { setOrderingOverride } from '@/lib/supplier/ordering'
import type { OrderLine } from '@/lib/orders/types'

const placeOrder = jest.fn()
const getSupplierOrder = jest.fn()

// Stand in for the LIVE provider. `getSupplier()` returns this whenever the
// resolver decides the app should be talking to PowerBody — so if it is called
// at all in simulate mode, the gate has failed.
jest.mock('@/lib/supplier/powerbody/live', () => ({
  createPowerBodyProvider: () => ({
    name: 'powerbody',
    getProduct: async () => null,
    getStockLevels: async () => [],
    placeOrder,
    getOrder: getSupplierOrder,
    listOrders: async () => [],
  }),
  __resetPowerBodyCache: () => {},
}))

const LINES: OrderLine[] = [
  { sku: 'ON-CREA-634', productId: 'creatine', title: 'Creatine', quantity: 1, unitPrice: 27.99, supplierCost: 16 },
]

const ENV_KEYS = ['POWERBODY_API_URL', 'POWERBODY_API_USER', 'POWERBODY_API_KEY'] as const

/** A deliverable UK address — `submitOrderToSupplier` refuses an order without one. */
const ADDRESS = {
  name: 'Sam Taylor',
  line1: '1 High Street',
  city: 'Leeds',
  postcode: 'LS1 4DY',
  country: 'GB',
}

async function approvedOrder() {
  const order = await createOrderFromCheckout({
    channel: 'shop',
    email: 'a@b.com',
    lines: LINES,
    shippingAddress: ADDRESS,
  })
  await approveOrderForSupplier(order.id, 'Test founder')
  return order
}

describe('ordering gate on submitOrderToSupplier', () => {
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      original[key] = process.env[key]
      process.env[key] = 'test'
    }
    placeOrder.mockReset()
    getSupplierOrder.mockReset()
    placeOrder.mockResolvedValue({ supplierOrderId: 'PB-REAL-1', status: 'received' })
    getSupplierOrder.mockResolvedValue({
      supplierOrderId: 'PB-REAL-1',
      reference: 'ref',
      status: 'shipped',
      lines: [],
      trackingNumber: 'TRK-REAL',
      updatedAt: new Date().toISOString(),
    })
    // Catalogue on live PowerBody — the state where getting this wrong ships a parcel.
    setSupplierOverride('powerbody')
    setOrderingOverride(null)
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
    setSupplierOverride(null)
    setOrderingOverride(null)
  })

  it('does not touch the live supplier by default, even with the live catalogue', async () => {
    const order = await approvedOrder()
    const submitted = await submitOrderToSupplier(order.id)

    expect(placeOrder).not.toHaveBeenCalled()
    expect(submitted?.status).toBe('submitted_to_supplier')
    expect(submitted?.supplierSimulated).toBe(true)
  })

  it('records the simulation in the audit trail', async () => {
    const order = await approvedOrder()
    const submitted = await submitOrderToSupplier(order.id)
    const submitEvent = submitted?.events.find((e) => e.type === 'submitted_to_supplier')
    expect(submitEvent?.detail).toMatch(/SIMULATED/)
  })

  it('still walks the full lifecycle when simulating', async () => {
    // The point of a dry run: the order can be submitted and synced exactly as a
    // real one would be, against the mock.
    const order = await approvedOrder()
    await submitOrderToSupplier(order.id)
    const synced = await syncSupplierStatus(order.id)

    expect(synced?.supplierStatus).toBe('received')
    expect(getSupplierOrder).not.toHaveBeenCalled()
  })

  it('places a real order once ordering is armed', async () => {
    setOrderingOverride('live')
    const order = await approvedOrder()
    const submitted = await submitOrderToSupplier(order.id)

    expect(placeOrder).toHaveBeenCalledTimes(1)
    expect(placeOrder.mock.calls[0][0]).toMatchObject({
      reference: order.id,
      lines: [{ sku: 'ON-CREA-634', quantity: 1 }],
    })
    expect(submitted?.supplierOrderId).toBe('PB-REAL-1')
    expect(submitted?.supplierSimulated).toBe(false)
  })

  it('refuses to go live while the catalogue is still on the mock supplier', async () => {
    setSupplierOverride('mock')
    setOrderingOverride('live')
    const order = await approvedOrder()
    const submitted = await submitOrderToSupplier(order.id)

    // Mock SKUs are fixtures — ordering them for real would buy nothing that exists.
    expect(placeOrder).not.toHaveBeenCalled()
    expect(submitted?.supplierSimulated).toBe(true)
  })

  it('keeps syncing a previously-simulated order against the mock after going live', async () => {
    const order = await approvedOrder()
    await submitOrderToSupplier(order.id) // simulated
    setOrderingOverride('live')
    const synced = await syncSupplierStatus(order.id)

    // History must not be retargeted at the real API by a later switch flip.
    expect(getSupplierOrder).not.toHaveBeenCalled()
    expect(synced?.supplierSimulated).toBe(true)
  })

  it('syncs a genuinely live order against the live supplier', async () => {
    setOrderingOverride('live')
    const order = await approvedOrder()
    await submitOrderToSupplier(order.id)
    const synced = await syncSupplierStatus(order.id)

    expect(getSupplierOrder).toHaveBeenCalledWith('PB-REAL-1')
    expect(synced?.trackingNumber).toBe('TRK-REAL')
    expect(synced?.status).toBe('shipped')
  })

  it('still requires approval regardless of mode', async () => {
    setOrderingOverride('live')
    const order = await createOrderFromCheckout({ channel: 'shop', lines: LINES })
    await expect(submitOrderToSupplier(order.id)).rejects.toThrow(/not been approved/)
    expect(placeOrder).not.toHaveBeenCalled()
  })
})
