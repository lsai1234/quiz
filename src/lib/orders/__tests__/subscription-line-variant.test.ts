/**
 * @jest-environment node
 */
import { subscriptionOrderLines } from '@/lib/orders/service'
import { skuForLine } from '@/lib/changes/detect'
import { mergeInto } from '@/lib/catalogue/merge'
import { splitOut } from '@/lib/catalogue/split'
import { rememberRenames } from '@/lib/catalogue/line-variant'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'
import type { MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'

/**
 * The SKU a renewal ships, and the SKU a supplier change is matched against.
 *
 * Lines are written as "flavour · size". Matching only the bare flavour meant
 * any product with both a flavour and a size never matched, and every renewal
 * shipped the first flavour in stock — a member who chose Vanilla got
 * Chocolate. Both the order and the change detection now go through
 * `variantForLine`; these pin that they do.
 */

function variant(over: Partial<CatalogueVariant> & { id: string }): CatalogueVariant {
  return { title: over.id, flavour: null, size: null, price: 34.99, compareAtPrice: null, available: true, ...over }
}

function whey(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  const { rating: _rating, ...sample } = MOCK_CATALOGUE[0] as CatalogueProduct
  void _rating
  return {
    ...sample,
    id: 'impact-whey',
    handle: 'impact-whey',
    title: 'Impact Whey Protein',
    cost: 17.5,
    variants: [
      variant({ id: 'iw-choc-1kg', title: 'Chocolate', flavour: 'Chocolate', size: '1kg', sku: 'IW-CHOC-1KG' }),
      variant({ id: 'iw-van-1kg', title: 'Vanilla', flavour: 'Vanilla', size: '1kg', sku: 'IW-VAN-1KG' }),
      variant({ id: 'iw-choc-2500', title: 'Chocolate', flavour: 'Chocolate', size: '2.5kg', sku: 'IW-CHOC-2500' }),
    ],
    defaultVariantId: 'iw-choc-1kg',
    ...over,
  }
}

function line(over: Partial<MemberSubscriptionLine> = {}): MemberSubscriptionLine {
  return {
    id: 'line-whey',
    productId: 'impact-whey',
    productTitle: 'Impact Whey Protein',
    variantTitle: 'Vanilla · 1kg',
    slotTitle: 'Protein',
    stackSlot: 'protein',
    quantity: 1,
    pricePerDelivery: 34.99,
    deliveryIntervalMonths: 1,
    deliveriesMade: 0,
    joinedAtMonth: 0,
    ...over,
  } as MemberSubscriptionLine
}

function sub(lines: MemberSubscriptionLine[]): MemberSubscription {
  return {
    id: 'sub_1',
    customerEmail: 'member@example.com',
    status: 'active',
    flatMonthly: 34.99,
    monthsActive: 0,
    minMonths: 1,
    lines,
  } as MemberSubscription
}

const shipped = (lines: MemberSubscriptionLine[], catalogue: CatalogueProduct[]) =>
  subscriptionOrderLines(sub(lines), catalogue, 0).map((l) => l.sku)

describe('a line written as "flavour · size" ships that flavour in that size', () => {
  it('in the renewal order', () => {
    expect(shipped([line({ variantTitle: 'Vanilla · 1kg' })], [whey()])).toEqual(['IW-VAN-1KG'])
    expect(shipped([line({ variantTitle: 'Chocolate · 2.5kg' })], [whey()])).toEqual(['IW-CHOC-2500'])
  })

  it('in the change detection', () => {
    expect(skuForLine(line({ variantTitle: 'Vanilla · 1kg' }), [whey()])).toBe('IW-VAN-1KG')
    expect(skuForLine(line({ variantTitle: 'Chocolate · 2.5kg' }), [whey()])).toBe('IW-CHOC-2500')
  })

  it('carries the line’s own price and the product’s cost onto the order', () => {
    const [order] = subscriptionOrderLines(sub([line({ quantity: 2, pricePerDelivery: 69.98 })]), [whey()], 0)
    expect(order).toMatchObject({ sku: 'IW-VAN-1KG', quantity: 2, unitPrice: 34.99, supplierCost: 17.5, variantTitle: 'Vanilla · 1kg' })
  })
})

describe('a line keeps its SKU through a rename, a split and a merge', () => {
  it('after the flavour is renamed', () => {
    const before = whey()
    const after = rememberRenames(before, {
      ...before,
      variants: before.variants.map((v) => (v.id === 'iw-van-1kg' ? { ...v, title: 'Vanilla Ice Cream', flavour: 'Vanilla Ice Cream' } : v)),
    })
    expect(shipped([line()], [after])).toEqual(['IW-VAN-1KG'])
    expect(skuForLine(line(), [after])).toBe('IW-VAN-1KG')
  })

  it('after the 2.5kg is split onto its own product', () => {
    const { kept, moved } = splitOut(whey(), ['iw-choc-2500'], { id: 'impact-whey-2-5kg' })!
    const big = line({ variantTitle: 'Chocolate · 2.5kg' })
    expect(shipped([big], [kept, moved])).toEqual(['IW-CHOC-2500'])
    expect(skuForLine(big, [kept, moved])).toBe('IW-CHOC-2500')
  })

  it('after the product is merged into another and is gone from the catalogue', () => {
    const target = whey({
      id: 'impact-whey-1kg',
      title: 'Impact Whey Protein 1kg',
      variants: [variant({ id: 'other-choc', title: 'Chocolate', flavour: 'Chocolate', size: '1kg', sku: 'IW-OTHER-CHOC' })],
      defaultVariantId: 'other-choc',
    })
    const source = whey({ variants: [whey().variants[1]], defaultVariantId: 'iw-van-1kg' })
    const merged = mergeInto(target, [source])

    expect(shipped([line()], [merged])).toEqual(['IW-VAN-1KG'])
    expect(skuForLine(line(), [merged])).toBe('IW-VAN-1KG')
  })

  it('a line that kept its SKU ships that SKU wherever it now lives', () => {
    const { kept, moved } = splitOut(whey(), ['iw-choc-2500'], { id: 'impact-whey-2-5kg' })!
    expect(skuForLine(line({ sku: 'IW-CHOC-2500', variantTitle: 'whatever it said' }), [kept, moved])).toBe('IW-CHOC-2500')
  })
})
