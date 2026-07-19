import {
  addLine, setLineQty, removeLine, basketItemCount,
  resolveBasket, basketSubtotal, basketToCheckoutLines, MAX_LINE_QTY,
} from '../helpers'
import type { BasketLine } from '../types'
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'

function variant(over: Partial<CatalogueVariant> = {}): CatalogueVariant {
  return {
    id: 'v1', title: 'Default', flavour: null, size: null, price: 30,
    compareAtPrice: null, available: true, shopifyVariantId: null, ...over,
  }
}

function makeProduct(over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return {
    id: 'p1', title: 'Product 1', handle: 'p1', description: '', imageUrl: null,
    category: 'Protein', stackSlots: ['protein'], goals: ['muscle'], dietaryTags: [],
    formats: ['powder'], variants: [variant()], basePrice: 30, compareAtPrice: null,
    subscriptionEligible: true, servings: 30, swapGroup: 'protein-whey',
    recommendationPriority: 7, marginPriority: 5, isCoreEligible: true,
    isBoosterEligible: false, hasStimulants: false, shortReason: '', warnings: [],
    shopifyProductId: null, ...over,
  }
}

describe('basket mutations', () => {
  it('adds a new line', () => {
    const lines = addLine([], 'p1', 'v1', 2)
    expect(lines).toEqual([{ productId: 'p1', variantId: 'v1', quantity: 2 }])
  })

  it('merges quantity into an existing line', () => {
    const lines = addLine(addLine([], 'p1', 'v1', 1), 'p1', 'v1', 2)
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(3)
  })

  it('keeps different variants of the same product as separate lines', () => {
    const lines = addLine(addLine([], 'p1', 'v1'), 'p1', 'v2')
    expect(lines).toHaveLength(2)
  })

  it('never adds a non-positive quantity', () => {
    expect(addLine([], 'p1', 'v1', 0)).toEqual([])
  })

  it('clamps to MAX_LINE_QTY', () => {
    const lines = addLine([], 'p1', 'v1', MAX_LINE_QTY + 50)
    expect(lines[0].quantity).toBe(MAX_LINE_QTY)
  })

  it('sets an exact quantity, and 0 removes the line', () => {
    const base: BasketLine[] = [{ productId: 'p1', variantId: 'v1', quantity: 5 }]
    expect(setLineQty(base, 'p1', 'v1', 2)[0].quantity).toBe(2)
    expect(setLineQty(base, 'p1', 'v1', 0)).toEqual([])
  })

  it('removes a line', () => {
    const base: BasketLine[] = [{ productId: 'p1', variantId: 'v1', quantity: 1 }]
    expect(removeLine(base, 'p1', 'v1')).toEqual([])
  })

  it('counts total items across lines', () => {
    const lines: BasketLine[] = [
      { productId: 'p1', variantId: 'v1', quantity: 2 },
      { productId: 'p2', variantId: 'v1', quantity: 3 },
    ]
    expect(basketItemCount(lines)).toBe(5)
  })
})

describe('resolveBasket + pricing', () => {
  const products = [
    makeProduct({ id: 'p1', variants: [variant({ id: 'v1', price: 30 })] }),
    makeProduct({ id: 'p2', variants: [variant({ id: 'v1', price: 12.5 })] }),
  ]

  it('joins lines to products/variants and computes line totals', () => {
    const resolved = resolveBasket([{ productId: 'p1', variantId: 'v1', quantity: 2 }], products)
    expect(resolved).toHaveLength(1)
    expect(resolved[0].lineTotal).toBe(60)
  })

  it('drops lines whose product or variant no longer exists', () => {
    const lines: BasketLine[] = [
      { productId: 'p1', variantId: 'v1', quantity: 1 },
      { productId: 'gone', variantId: 'v1', quantity: 1 },
      { productId: 'p1', variantId: 'gone', quantity: 1 },
    ]
    expect(resolveBasket(lines, products)).toHaveLength(1)
  })

  it('subtotals the resolved lines', () => {
    const resolved = resolveBasket(
      [
        { productId: 'p1', variantId: 'v1', quantity: 2 }, // 60
        { productId: 'p2', variantId: 'v1', quantity: 1 }, // 12.5
      ],
      products,
    )
    expect(basketSubtotal(resolved)).toBe(72.5)
  })
})

describe('basketToCheckoutLines', () => {
  it('uses the Shopify variant id when present, else the internal id', () => {
    const products = [
      makeProduct({ id: 'p1', variants: [variant({ id: 'v1', shopifyVariantId: 'gid://shopify/ProductVariant/1' })] }),
      makeProduct({ id: 'p2', variants: [variant({ id: 'v2', shopifyVariantId: null })] }),
    ]
    const resolved = resolveBasket(
      [
        { productId: 'p1', variantId: 'v1', quantity: 1 },
        { productId: 'p2', variantId: 'v2', quantity: 3 },
      ],
      products,
    )
    const lines = basketToCheckoutLines(resolved)
    expect(lines[0].merchandiseId).toBe('gid://shopify/ProductVariant/1')
    expect(lines[1].merchandiseId).toBe('v2')
    expect(lines[1].quantity).toBe(3)
    expect(lines[0].attributes).toEqual([
      { key: 'source', value: 'shop' },
      { key: 'product', value: 'Product 1' },
    ])
  })
})
