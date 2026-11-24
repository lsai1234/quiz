import { reorderLines } from '../reorder'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'

const product = MOCK_CATALOGUE.find((p) => p.variants.filter((v) => v.available).length >= 2)!
const [first, second] = product.variants.filter((v) => v.available)

describe('buying an order again', () => {
  it('puts back the same variant, at the same quantity', () => {
    expect(reorderLines([{ productId: product.id, variantId: second.id, title: product.title, quantity: 2 }], MOCK_CATALOGUE)).toEqual({
      add: [{ productId: product.id, variantId: second.id, quantity: 2 }],
      missing: [],
    })
  })

  it('takes the product’s first variant on sale when that one has gone', () => {
    const gone = MOCK_CATALOGUE.map((p) => (p.id === product.id ? { ...p, variants: p.variants.map((v) => (v.id === second.id ? { ...v, available: false } : v)) } : p))
    expect(reorderLines([{ productId: product.id, variantId: second.id, title: product.title, quantity: 1 }], gone).add[0].variantId).toBe(first.id)
  })

  it('names what can’t come back', () => {
    const r = reorderLines([{ productId: 'retired-product', variantId: null, title: 'Old Pre-Workout', quantity: 1 }], MOCK_CATALOGUE)
    expect(r).toEqual({ add: [], missing: ['Old Pre-Workout'] })
  })
})
