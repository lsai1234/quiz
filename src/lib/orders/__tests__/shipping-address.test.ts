/**
 * Correcting the delivery address on an order.
 *
 * The field decides where physical goods go, so the cases that matter are the
 * refusals: an address the supplier already holds, and an address that is
 * missing something PowerBody needs.
 */
import { createOrderFromCheckout, updateShippingAddress, newOrderId } from '@/lib/orders/service'
import { getOrder, saveOrder } from '@/lib/orders/repo'
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
    it('refuses once the order has gone to the supplier', async () => {
      const order = await paidOrder()
      order.status = 'submitted_to_supplier'
      order.supplierOrderId = 'PB-123'
      await saveOrder(order)

      await expect(updateShippingAddress(order.id, GOOD)).rejects.toThrow(/already gone to the supplier/)
      // And nothing was written.
      expect((await getOrder(order.id))?.shippingAddress).toBeNull()
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
})
