/**
 * @jest-environment node
 */
import { orderWeightKg, subscriptionOrderLines } from '@/lib/orders/service'
import { stockItemsFor } from '@/lib/orders/auto-send'
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

describe('the order line names the product that sells the SKU now', () => {
  /*
    The line keeps the id it was chosen under. After a merge or a split that id
    names a product that no longer holds the SKU, and every later lookup by the
    order line's productId — the per-SKU PowerBody id for the stock check, the
    parcel weight, the VAT rate, the swap candidates — missed.
  */
  const cw = () =>
    whey({
      id: 'cw',
      title: 'Critical Whey 2kg',
      cost: 24.5,
      weightGrams: 2150,
      supplierProductId: '1200',
      variants: [variant({ id: 'cw-choc', title: 'Chocolate', flavour: 'Chocolate', size: '2kg', sku: 'P100', supplierProductId: '1200' })],
      defaultVariantId: 'cw-choc',
    })
  const strawberry = () =>
    whey({
      id: 'cw-straw',
      title: 'Critical Whey 2kg Strawberry',
      cost: 25.1,
      weightGrams: 2150,
      supplierProductId: '1300',
      variants: [variant({ id: 'straw', title: 'Strawberry', flavour: 'Strawberry', size: '2kg', sku: 'P300' })],
      defaultVariantId: 'straw',
    })
  const strawberryLine = (over: Partial<MemberSubscriptionLine> = {}) =>
    line({ productId: 'cw-straw', productTitle: 'Critical Whey 2kg Strawberry', variantTitle: 'Strawberry · 2kg', ...over })

  it.each([
    ['by its label', {}],
    ['by the SKU it kept', { sku: 'P300', variantTitle: 'whatever it said' }],
  ])('after a merge, found %s: the product it joined, with that SKU’s own PowerBody id, cost and weight', (_how, over) => {
    const merged = mergeInto(cw(), [strawberry()])
    const [order] = subscriptionOrderLines(sub([strawberryLine(over as Partial<MemberSubscriptionLine>)]), [merged], 0)

    // Still invoiced as what the member chose.
    expect(order).toMatchObject({ sku: 'P300', productId: 'cw', title: 'Critical Whey 2kg Strawberry', supplierCost: 25.1 })
    expect(stockItemsFor({ lines: [order] }, [merged])[0].supplierProductId).toBe('1300')
    expect(orderWeightKg([order], [merged])).toBeCloseTo(2.15)
  })

  it('after a split, the product the size moved to — not the parent’s PowerBody id', () => {
    const parent = whey({ supplierProductId: '501', weightGrams: 1000 })
    const { kept, moved } = splitOut(parent, ['iw-choc-2500'], { id: 'impact-whey-2-5kg' })!
    const big = { ...moved, weightGrams: 2500, variants: moved.variants.map((v) => ({ ...v, supplierProductId: '777' })) }

    const [order] = subscriptionOrderLines(sub([line({ variantTitle: 'Chocolate · 2.5kg' })]), [kept, big], 0)

    expect(order).toMatchObject({ sku: 'IW-CHOC-2500', productId: 'impact-whey-2-5kg', title: 'Impact Whey Protein' })
    expect(stockItemsFor({ lines: [order] }, [kept, big])[0].supplierProductId).toBe('777')
    expect(orderWeightKg([order], [kept, big])).toBeCloseTo(2.5)
  })

  it('after a merge is undone, a line written against the target follows the SKU back to its own product', () => {
    const [order] = subscriptionOrderLines(sub([line({ productId: 'cw', productTitle: 'Critical Whey 2kg', sku: 'P300', variantTitle: 'Strawberry' })]), [cw(), strawberry()], 0)
    expect(order).toMatchObject({ sku: 'P300', productId: 'cw-straw' })
    expect(stockItemsFor({ lines: [order] }, [cw(), strawberry()])[0].supplierProductId).toBe('1300')
  })

  it('keeps the line’s own id when nothing on sale holds the SKU, so the order still says what it was', () => {
    const [order] = subscriptionOrderLines(sub([strawberryLine()]), [cw()], 0)
    expect(order).toMatchObject({ sku: null, productId: 'cw-straw', supplierCost: null })
  })
})
