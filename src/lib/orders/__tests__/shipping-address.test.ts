/**
 * Correcting the delivery address on an order.
 *
 * The field decides where physical goods go, so the cases that matter are the
 * refusals: an address the supplier already holds, and an address that is
 * missing something PowerBody needs.
 */
import { createOrderFromCheckout, updateShippingAddress, newOrderId } from '@/lib/orders/service'
import { getOrder, saveOrder } from '@/lib/orders/repo'
import { __resetMockOrders, createMockSupplier } from '@/lib/supplier/powerbody/mock'
import type { SupplierAddress } from '@/lib/supplier/types'

const GOOD: SupplierAddress = {
  name: 'Ada Lovelace',
  line1: '12 Bell Street',
  line2: 'Flat 4',
  city: 'Leeds',
  postcode: 'ls1 4dy',
  country: 'GB',
  phone: '07700900123',
  email: 'ada@example.com',
}

async function paidOrder() {
  return createOrderFromCheckout({
    id: newOrderId(),
    status: 'paid',
    channel: 'shop',
    userId: null,
    email: 'buyer@example.com',
    shipping: 0,
    lines: [
      { sku: 'SKU1', productId: 'p1', title: 'Whey', quantity: 1, unitPrice: 20 },
    ],
  })
}

describe('updateShippingAddress', () => {
  beforeEach(() => {
    __resetMockOrders()
    process.env.SUPPLIER_ORDERING = 'simulate'
  })

  it('sets the address and records what it was changed from', async () => {
    const order = await paidOrder()
    const updated = await updateShippingAddress(order.id, GOOD, 'Founder One')

    expect(updated?.shippingAddress?.line1).toBe('12 Bell Street')
    expect(updated?.shippingAddress?.city).toBe('Leeds')
    const entry = updated?.events.find((e) => e.type === 'address-updated')
    expect(entry).toBeDefined()
    expect(entry?.detail).toContain('Founder One')
    expect(entry?.detail).toContain('none was recorded before')
  })

  it('normalises the postcode rather than storing what was typed', async () => {
    const order = await paidOrder()
    const updated = await updateShippingAddress(order.id, GOOD)
    expect(updated?.shippingAddress?.postcode).toBe('LS1 4DY')
  })

  it('names the previous address in the trail on a second edit', async () => {
    const order = await paidOrder()
    await updateShippingAddress(order.id, GOOD)
    const updated = await updateShippingAddress(order.id, { ...GOOD, line1: '9 Other Road' })

    const entries = updated?.events.filter((e) => e.type === 'address-updated') ?? []
    expect(entries).toHaveLength(2)
    expect(entries[1].detail).toContain('was Ada Lovelace, 12 Bell Street')
  })

  it('returns null for an order that does not exist', async () => {
    expect(await updateShippingAddress('ord_nope', GOOD)).toBeNull()
  })

  describe('what it refuses', () => {
    it('refuses once the parcel has shipped', async () => {
      const order = await paidOrder()
      order.status = 'shipped'
      order.supplierOrderId = 'PB-123'
      await saveOrder(order)

      await expect(updateShippingAddress(order.id, GOOD)).rejects.toThrow(/parcel has left/)
      // And nothing was written.
      expect((await getOrder(order.id))?.shippingAddress).toBeNull()
    })

    it('refuses once delivered', async () => {
      const order = await paidOrder()
      order.status = 'delivered'
      await saveOrder(order)
      await expect(updateShippingAddress(order.id, GOOD)).rejects.toThrow(/parcel has left/)
    })

    it('refuses a refunded order', async () => {
      const order = await paidOrder()
      order.status = 'refunded'
      await saveOrder(order)
      await expect(updateShippingAddress(order.id, GOOD)).rejects.toThrow(/refunded/)
    })

    it('names every missing field in one sentence', async () => {
      const order = await paidOrder()
      await expect(
        updateShippingAddress(order.id, { ...GOOD, name: '', line1: '  ', postcode: '' }),
      ).rejects.toThrow('The delivery address needs a name, the first address line and a postcode.')
    })

    it('refuses an address outside the UK', async () => {
      const order = await paidOrder()
      await expect(
        updateShippingAddress(order.id, { ...GOOD, country: 'FR', postcode: '75001' }),
      ).rejects.toThrow(/UK/)
    })

    it('refuses an address with neither phone nor email', async () => {
      const order = await paidOrder()
      await expect(
        updateShippingAddress(order.id, { ...GOOD, phone: '', email: '' }),
      ).rejects.toThrow(/phone number or an email/)
    })

    it('accepts an address with only one of the two', async () => {
      const order = await paidOrder()
      const updated = await updateShippingAddress(order.id, { ...GOOD, phone: null })
      expect(updated?.shippingAddress?.email).toBe('ada@example.com')
      expect(updated?.shippingAddress?.phone).toBeNull()
    })
  })

  /**
   * The half that matters: an order PowerBody already holds is corrected at
   * THEIR end first, and a refusal from them leaves our row untouched.
   */
  describe('an order already with the supplier', () => {
    async function submittedOrder() {
      const order = await paidOrder()
      const supplier = createMockSupplier()
      const placed = await supplier.placeOrder({
        // `supplierOrderInputFor` sends the internal id as the supplier
        // reference, which is what PowerBody key `updateOrder` on.
        reference: order.id,
        shippingAddress: { ...GOOD, postcode: 'LS1 4DY' },
        shippingPrice: 0,
        weightKg: null,
        lines: [{ sku: 'SKU1', quantity: 1, name: 'Whey', unitPrice: 20, taxPercent: 20 }],
      })
      order.status = 'submitted_to_supplier'
      order.supplierOrderId = placed.supplierOrderId
      order.supplierSimulated = true
      await saveOrder(order)
      return order
    }

    it('still allows the edit, and says the supplier was updated too', async () => {
      const order = await submittedOrder()
      const updated = await updateShippingAddress(order.id, { ...GOOD, line1: '9 New Road' })

      expect(updated?.shippingAddress?.line1).toBe('9 New Road')
      const entry = updated?.events.filter((e) => e.type === 'address-updated').pop()
      expect(entry?.detail).toContain('the supplier was updated too')
    })

    it('writes nothing locally when the supplier refuses', async () => {
      const order = await submittedOrder()
      // No stored supplier order for this reference — the mock refuses, exactly
      // as PowerBody would for an order they have already picked.
      __resetMockOrders()

      // The refusal names the supplier and says plainly that nothing changed —
      // a raw Magento fault on its own reads as our app breaking.
      await expect(updateShippingAddress(order.id, { ...GOOD, line1: '9 New Road' })).rejects.toThrow(
        /supplier would not accept the new address/,
      )
      await expect(updateShippingAddress(order.id, { ...GOOD, line1: '9 New Road' })).rejects.toThrow(
        /never placed with them under this reference/,
      )
      expect((await getOrder(order.id))?.shippingAddress).toBeNull()
    })
  })
})
