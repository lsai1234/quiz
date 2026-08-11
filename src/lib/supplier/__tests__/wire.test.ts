import {
  isDiscontinuedStatus,
  isSellableStatus,
  num,
  numOrNull,
  readOrderAck,
  toCreateOrderPayload,
  toStockLevel,
  toSupplierOrder,
  toSupplierOrderStatus,
  toSupplierProduct,
  vatFraction,
  weightToGrams,
} from '@/lib/supplier/powerbody/wire'
import type { SupplierOrderInput } from '@/lib/supplier/types'

const AT = '2026-08-07T09:00:00.000Z'

describe('PowerBody wire mapping', () => {
  describe('coercion', () => {
    it('reads PHP-style numeric strings', () => {
      expect(num('12.50')).toBe(12.5)
      expect(num('£12.50')).toBe(12.5)
      expect(num('')).toBe(0)
      expect(num(null)).toBe(0)
      expect(num(undefined, 7)).toBe(7)
    })

    it('distinguishes "zero" from "not reported"', () => {
      expect(numOrNull(0)).toBe(0)
      expect(numOrNull('0')).toBe(0)
      expect(numOrNull('')).toBeNull()
      expect(numOrNull(null)).toBeNull()
      expect(numOrNull(undefined)).toBeNull()
    })

    it('turns their percentage VAT into a fraction', () => {
      expect(vatFraction(20)).toBe(0.2)
      expect(vatFraction('20')).toBe(0.2)
      expect(vatFraction(0)).toBe(0)
      expect(vatFraction(null)).toBeNull()
    })

    it('passes through a VAT rate already expressed as a fraction', () => {
      // Guards against dividing prices by 100 if their feed ever switches units.
      expect(vatFraction(0.2)).toBe(0.2)
    })

    it('converts kilogram weights to grams', () => {
      expect(weightToGrams(1.15)).toBe(1150)
      expect(weightToGrams('0.5')).toBe(500)
      expect(weightToGrams(null)).toBeNull()
      expect(weightToGrams(0)).toBeNull()
    })

    it('treats a large weight as already being grams', () => {
      expect(weightToGrams(500)).toBe(500)
    })
  })

  describe('product status', () => {
    it('treats only active products as sellable', () => {
      expect(isSellableStatus('active')).toBe(true)
      expect(isSellableStatus('out of stock')).toBe(false)
      expect(isSellableStatus('disabled')).toBe(false)
      expect(isSellableStatus('archival')).toBe(false)
    })

    it('treats a missing status as sellable (the list feed omits it)', () => {
      expect(isSellableStatus(undefined)).toBe(true)
      expect(isSellableStatus('')).toBe(true)
    })

    it('separates discontinued from merely out of stock', () => {
      expect(isDiscontinuedStatus('disabled')).toBe(true)
      expect(isDiscontinuedStatus('archival')).toBe(true)
      expect(isDiscontinuedStatus('out of stock')).toBe(false)
    })
  })

  describe('toSupplierProduct', () => {
    const info = {
      sku: 'PB-WHEY-1KG',
      product_id: '4021',
      name: 'Whey Protein 1kg',
      manufacturer: 'PowerBody',
      category: 'Protein',
      description_en: 'A whey protein.',
      image: 'https://img.example/whey.jpg',
      ean: '5060000000001',
      price: '18.75',
      price_tax: '22.50',
      detail_price: '34.99',
      qty: '42',
      vat_rate: '20',
      portion_count: '33',
      weight: '1.15',
      status: 'active',
    }

    it('maps the full detail payload', () => {
      const product = toSupplierProduct(info, AT)
      expect(product).toMatchObject({
        sku: 'PB-WHEY-1KG',
        name: 'Whey Protein 1kg',
        brand: 'PowerBody',
        category: 'Protein',
        description: 'A whey protein.',
        imageUrl: 'https://img.example/whey.jpg',
        barcode: '5060000000001',
        // What we pay them, and what they suggest we charge.
        wholesalePrice: 18.75,
        rrp: 34.99,
        currency: 'GBP',
        stock: 42,
        inStock: true,
        servings: 33,
        weightGrams: 1150,
        vatRate: 0.2,
        updatedAt: AT,
      })
    })

    it('is out of stock when the supplier has disabled it, even with stock on hand', () => {
      // A disabled product stays visible for 30 days — selling it would take an
      // order PowerBody will never fill.
      const product = toSupplierProduct({ ...info, status: 'disabled' }, AT)
      expect(product.stock).toBe(42)
      expect(product.inStock).toBe(false)
    })

    it('is out of stock at zero qty', () => {
      expect(toSupplierProduct({ ...info, qty: '0' }, AT).inStock).toBe(false)
    })

    it('falls back to the wholesale price when no retail price is quoted', () => {
      const product = toSupplierProduct({ ...info, detail_price: '', price_tax: '' }, AT)
      expect(product.rrp).toBe(18.75)
    })

    it('survives a row with nothing but a SKU', () => {
      const product = toSupplierProduct({ sku: 'PB-BARE' }, AT)
      expect(product.sku).toBe('PB-BARE')
      // The name falls back to the SKU rather than rendering blank in the hub.
      expect(product.name).toBe('PB-BARE')
      expect(product.inStock).toBe(false)
      expect(product.weightGrams).toBeNull()
      expect(product.vatRate).toBeNull()
    })
  })

  describe('toStockLevel', () => {
    it('maps the cheap list row', () => {
      const level = toStockLevel({ sku: 'PB-1', price: '10.00', price_tax: '12.00', qty: '5' }, AT)
      expect(level).toEqual({
        sku: 'PB-1',
        stock: 5,
        inStock: true,
        wholesalePrice: 10,
        rrp: 12,
        updatedAt: AT,
      })
    })

    it('is out of stock at zero qty', () => {
      expect(toStockLevel({ sku: 'PB-1', price: '10.00', qty: '0' }, AT).inStock).toBe(false)
    })
  })

  describe('order status', () => {
    it('maps their Magento vocabulary onto ours', () => {
      expect(toSupplierOrderStatus('complete')).toBe('shipped')
      expect(toSupplierOrderStatus('processing')).toBe('processing')
      expect(toSupplierOrderStatus('canceled')).toBe('cancelled')
      expect(toSupplierOrderStatus('cancelled')).toBe('cancelled')
      expect(toSupplierOrderStatus('delivered')).toBe('delivered')
    })

    it('reads an unpaid/unknown order as merely received', () => {
      // API orders rest at "holded" until they are paid for.
      expect(toSupplierOrderStatus('holded')).toBe('received')
      expect(toSupplierOrderStatus('pending')).toBe('received')
      expect(toSupplierOrderStatus('something_new')).toBe('received')
      expect(toSupplierOrderStatus(undefined)).toBe('received')
    })
  })

  describe('toSupplierOrder', () => {
    it('prefers their increment id and keeps our reference', () => {
      const order = toSupplierOrder(
        {
          order_id: 'ord_abc',
          powerbody_order_id: '100012345',
          status: 'processing',
          tracking_number: 'TRK1',
          products: [{ sku: 'PB-1', qty: '2' }],
        },
        AT,
      )
      expect(order).toEqual({
        supplierOrderId: '100012345',
        reference: 'ord_abc',
        status: 'processing',
        lines: [{ sku: 'PB-1', quantity: 2 }],
        trackingNumber: 'TRK1',
        updatedAt: AT,
      })
    })

    it('nulls an empty tracking number rather than passing an empty string on', () => {
      expect(toSupplierOrder({ order_id: 'x', tracking_number: '' }, AT).trackingNumber).toBeNull()
    })
  })

  describe('toCreateOrderPayload', () => {
    const order: SupplierOrderInput = {
      reference: 'ord_abc123',
      shippingAddress: {
        name: 'Ada Lovelace',
        line1: '12 Dean Street',
        line2: 'Flat 3',
        city: 'London',
        postcode: 'W1D 3RR',
        country: 'GB',
        phone: '07700900000',
      },
      lines: [{ sku: 'PB-1', quantity: 2 }],
    }

    it('sends our reference as their id, so getOrders can be reconciled', () => {
      const payload = toCreateOrderPayload(order, { dateAdd: '2026-08-07 09:00:00' })
      expect(payload.id).toBe('ord_abc123')
      expect(payload.currency_rate).toBe(1)
      expect(payload.date_add).toBe('2026-08-07 09:00:00')
    })

    it('splits our single name field into their name/surname', () => {
      const { address } = toCreateOrderPayload(order)
      expect(address).toMatchObject({
        name: 'Ada',
        surname: 'Lovelace',
        address1: '12 Dean Street',
        address2: 'Flat 3',
        postcode: 'W1D 3RR',
        city: 'London',
        country_code: 'GB',
        phone: '07700900000',
      })
    })

    it('repeats a single-word name rather than sending an empty surname', () => {
      const { address } = toCreateOrderPayload({
        ...order,
        shippingAddress: { ...order.shippingAddress, name: 'Prince' },
      })
      expect(address.name).toBe('Prince')
      expect(address.surname).toBe('Prince')
    })

    it('carries the weight and our own prices for their invoice', () => {
      const payload = toCreateOrderPayload(order, {
        weightKg: 2.3,
        shippingPrice: 4.99,
        transportCode: 'UK_ZONE1',
        lineDetail: { 'PB-1': { name: 'Whey 1kg', price: 39.99, taxPercent: 20 } },
      })
      expect(payload.weight).toBe(2.3)
      expect(payload.shipping_price).toBe(4.99)
      expect(payload.transport_code).toBe('UK_ZONE1')
      expect(payload.products).toEqual([
        { product_id: '', sku: 'PB-1', name: 'Whey 1kg', qty: 2, price: 39.99, currency: 'GBP', tax: 20 },
      ])
    })

    it('takes the invoice fields off the order itself', () => {
      // The order carries these now — nothing has to remember to pass a context
      // for a real send, which is exactly what used to go wrong.
      const payload = toCreateOrderPayload({
        ...order,
        shippingPrice: 3.9,
        weightKg: 1.2,
        comment: 'CHRGD-7K4M2XQP',
        lines: [{ sku: 'PB-1', quantity: 2, name: 'Whey 1kg — Chocolate', unitPrice: 39.99, taxPercent: 20 }],
      })
      expect(payload.shipping_price).toBe(3.9)
      expect(payload.weight).toBe(1.2)
      expect(payload.comment).toBe('CHRGD-7K4M2XQP')
      expect(payload.products[0]).toMatchObject({ name: 'Whey 1kg — Chocolate', price: 39.99, tax: 20 })
    })

    it('sends no weight at all when we do not know it', () => {
      // Rather than a zero, which reads as a measured weightless parcel and puts
      // it in the wrong delivery band. PowerBody publish no weight on either
      // product call, so this is the normal case.
      expect(toCreateOrderPayload(order).weight).toBe('')
    })

    it('carries the recipient email, for the courier verification code', () => {
      const { address } = toCreateOrderPayload({
        ...order,
        shippingAddress: { ...order.shippingAddress, email: 'ada@example.com' },
      })
      expect(address.email).toBe('ada@example.com')
    })

    it('sends a country NAME in the name field, not the code twice over', () => {
      const { address } = toCreateOrderPayload(order)
      expect(address.country_name).toBe('United Kingdom')
      expect(address.country_code).toBe('GB')
    })
  })

  describe('readOrderAck', () => {
    it('accepts their success responses', () => {
      expect(readOrderAck({ api_response: 'SUCCESS' })).toMatchObject({ ok: true, alreadyExists: false })
      expect(readOrderAck({ api_response: 'UPDATE_SUCCESS' })).toMatchObject({ ok: true })
    })

    it('treats ALREADY_EXISTS as success so a retry cannot double-ship', () => {
      expect(readOrderAck({ api_response: 'ALREADY_EXISTS' })).toEqual({
        ok: true,
        response: 'ALREADY_EXISTS',
        alreadyExists: true,
      })
    })

    it('rejects failures and anything it does not recognise', () => {
      expect(readOrderAck({ api_response: 'FAIL' }).ok).toBe(false)
      expect(readOrderAck({ api_response: 'UPDATE_FAIL' }).ok).toBe(false)
      expect(readOrderAck(null)).toEqual({ ok: false, response: 'UNKNOWN', alreadyExists: false })
    })
  })
})
