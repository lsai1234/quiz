import {
  attentionChecks,
  attentionSummary,
  categoriesOf,
  countViews,
  matchesProduct,
  parseShow,
  priceLabel,
  sectionFor,
  servingsLabel,
  stockLabel,
  visibleEntries,
  type ListFilters,
} from '../model'
import { FAIL_COST, INFO_WEIGHT, WARN_COST, makeEntry, makeProduct } from './fixtures'

const ALL: ListFilters = { show: 'all', query: '', category: '', several: false, subscription: false }

describe('the Products list model', () => {
  describe('search', () => {
    const whey = makeProduct({
      id: 'whey',
      title: 'Whey Isolate',
      shortName: 'Iso Whey',
      brand: 'Optimum',
      category: 'Protein',
      supplierProductId: '20031',
      variants: [
        { id: 'a', title: 'Chocolate / 2kg', flavour: 'Chocolate', size: '2kg', price: 50, compareAtPrice: null, available: true, sku: 'ON-ISO-CHOC-2KG', supplierProductId: '20044' },
        { id: 'b', title: 'Vanilla / 2kg', flavour: 'Vanilla', size: '2kg', price: 50, compareAtPrice: null, available: true, sku: 'ON-ISO-VAN-2KG' },
      ],
    })

    it.each([
      ['a SKU', 'on-iso-van-2kg'],
      ['part of a SKU', 'ISO-CHOC'],
      ['the product’s PowerBody id', '20031'],
      ['a SKU’s own PowerBody id', '20044'],
      ['the short name', 'iso whey'],
      ['the brand', 'optimum'],
      ['the category', 'protein'],
      ['a flavour', 'vanilla'],
      ['a size', '2kg'],
      ['words from different fields', 'whey chocolate'],
    ])('finds a product by %s', (_what, query) => {
      expect(matchesProduct(whey, query)).toBe(true)
    })

    it('needs every word to match somewhere', () => {
      expect(matchesProduct(whey, 'whey strawberry')).toBe(false)
    })

    it('matches everything when the box is empty', () => {
      expect(matchesProduct(whey, '   ')).toBe(true)
    })
  })

  describe('views', () => {
    const entries = [
      makeEntry({ id: 'ok', title: 'B fine' }),
      makeEntry({ id: 'warn', title: 'C warned' }, { checks: [WARN_COST] }),
      makeEntry({ id: 'fail', title: 'Z blocked' }, { checks: [FAIL_COST, WARN_COST] }),
      makeEntry({ id: 'info', title: 'A informed' }, { checks: [INFO_WEIGHT] }),
      makeEntry({ id: 'pending', title: 'D pending' }, { state: 'pending', checks: [FAIL_COST], remaining: 3 }),
      makeEntry({ id: 'gone', title: 'AA removed' }, { state: 'removed', checks: [FAIL_COST] }),
    ]

    it('counts each view, with attention as blocking plus warnings', () => {
      expect(countViews(entries)).toEqual({ live: 4, pending: 1, blocking: 1, warnings: 1, attention: 2, removed: 1, all: 6 })
    })

    it('never counts an info check as something to fix', () => {
      const info = entries.find((e) => e.product.id === 'info')!
      expect(attentionChecks(info.readiness)).toEqual([])
      expect(attentionSummary(info)).toBeNull()
      expect(visibleEntries(entries, { ...ALL, show: 'attention' }).map((e) => e.product.id)).not.toContain('info')
    })

    it('puts blocking before warnings in the attention view, whatever the titles', () => {
      expect(visibleEntries(entries, { ...ALL, show: 'attention' }).map((e) => e.product.id)).toEqual(['fail', 'warn'])
    })

    it('counts attention on what is on sale only — not waiting or removed products', () => {
      const ids = visibleEntries(entries, { ...ALL, show: 'blocking' }).map((e) => e.product.id)
      expect(ids).toEqual(['fail'])
    })

    it('sinks removed products to the bottom of All', () => {
      const ids = visibleEntries(entries, ALL).map((e) => e.product.id)
      expect(ids[ids.length - 1]).toBe('gone')
      expect(ids[0]).toBe('info') // "A informed" — A–Z above the removed one
    })

    it('reads an unknown view as All', () => {
      expect(parseShow('readiness')).toBe('all')
      expect(parseShow(null)).toBe('all')
      expect(parseShow('attention')).toBe('attention')
      expect(parseShow('warnings')).toBe('warnings')
    })

    it('combines category, shape and subscription with the view', () => {
      const rows = [
        makeEntry({ id: 'one', category: 'Protein' }),
        makeEntry({
          id: 'many',
          category: 'Protein',
          variants: [
            { id: 'x', title: 'x', flavour: 'x', size: null, price: 1, compareAtPrice: null, available: true },
            { id: 'y', title: 'y', flavour: 'y', size: null, price: 1, compareAtPrice: null, available: true },
          ],
        }),
        makeEntry({ id: 'oneoff', category: 'Accessories', subscriptionEligible: false }),
      ]
      expect(visibleEntries(rows, { ...ALL, several: true }).map((e) => e.product.id)).toEqual(['many'])
      expect(visibleEntries(rows, { ...ALL, category: 'Accessories' }).map((e) => e.product.id)).toEqual(['oneoff'])
      expect(visibleEntries(rows, { ...ALL, subscription: true }).map((e) => e.product.id).sort()).toEqual(['many', 'one'])
      expect(categoriesOf(rows)).toEqual([
        { name: 'Accessories', count: 1 },
        { name: 'Protein', count: 2 },
      ])
    })
  })

  describe('what a row says', () => {
    it('prints "was" only when it was more, and marks a price set by hand', () => {
      expect(priceLabel(makeProduct({ basePrice: 23.99, compareAtPrice: 14.9 }))).toBe('£23.99')
      expect(priceLabel(makeProduct({ basePrice: 23.99, compareAtPrice: 29.99 }))).toBe('£23.99  (was £29.99)')
      expect(
        priceLabel(
          makeProduct({
            basePrice: 99.99,
            variants: [{ id: 'v', title: '', flavour: null, size: null, price: 99.99, compareAtPrice: null, available: true, priceSource: 'founder' }],
          }),
        ),
      ).toBe('£99.99 · your price')
    })

    it('reads servings from the master SKU, the way the shelf does', () => {
      const p = makeProduct({
        servings: 20,
        defaultVariantId: 'm',
        variants: [{ id: 'm', title: '', flavour: null, size: '1kg', price: 1, compareAtPrice: null, available: true, servings: 33 }],
      })
      expect(servingsLabel(p)).toBe('33 servings')
      expect(servingsLabel(makeProduct({ category: 'Accessories', swapGroup: 'accessory' }))).toBeNull()
    })

    it('summarises stock across the SKUs', () => {
      const v = (available: boolean) => ({ id: String(Math.random()), title: '', flavour: null, size: null, price: 1, compareAtPrice: null, available })
      expect(stockLabel(makeProduct({ variants: [v(true), v(true)] })).text).toBe('All in stock')
      expect(stockLabel(makeProduct({ variants: [v(true), v(false), v(false)] })).text).toBe('2 sold out')
      expect(stockLabel(makeProduct({ variants: [v(false), v(false)] })).text).toBe('All sold out')
      expect(stockLabel(makeProduct({ variants: [v(false)] })).text).toBe('Sold out')
    })

    it('sends each check to the section that fixes it, and anything unknown to Checks', () => {
      expect(sectionFor('supplier')).toBe('supplier')
      expect(sectionFor('prices')).toBe('variants')
      expect(sectionFor('somewhere-new')).toBe('checks')
      expect(sectionFor(undefined)).toBe('checks')
    })

    it('says how much is left on a product waiting for review', () => {
      expect(attentionSummary(makeEntry({}, { state: 'pending', remaining: 1 }))?.text).toBe(
        '1 thing to check before it can go on sale',
      )
      expect(attentionSummary(makeEntry({}, { checks: [FAIL_COST, WARN_COST] }))?.text).toBe('2 things to fix · 1 blocking')
    })
  })
})
