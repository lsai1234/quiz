/**
 * Detection, from fixtures only — no database, no supplier.
 */
import {
  diffSupplierFeed,
  findAffectedLines,
  inStockCatalogue,
  skuForLine,
  type FeedEntry,
  type SupplierSnapshot,
} from '@/lib/changes/detect'
import { getPricingConfig, resetPricingOverrides, setPricingOverrides } from '@/lib/stack-blueprint/pricing'
import { line, product, subscriptionWith } from './fixtures'

afterEach(() => resetPricingOverrides())

const NOW = new Date('2026-07-29T09:00:00.000Z')

function snapshot(over: Partial<SupplierSnapshot> & { sku: string }): SupplierSnapshot {
  return {
    stock: 10,
    inStock: true,
    wholesalePrice: 10,
    rrp: 30,
    missedSyncs: 0,
    lastSeenAt: '2026-07-28T09:00:00.000Z',
    updatedAt: '2026-07-28T09:00:00.000Z',
    ...over,
  }
}

function entry(over: Partial<FeedEntry> & { sku: string }): FeedEntry {
  return { stock: 10, inStock: true, wholesalePrice: 10, rrp: 30, ...over }
}

const diff = (prev: SupplierSnapshot[], feed: FeedEntry[]) =>
  diffSupplierFeed(prev, feed, { now: NOW, config: getPricingConfig() })

describe('out of stock vs discontinued', () => {
  it('flags a present-but-unbuyable SKU as out of stock, not discontinued', () => {
    const result = diff([snapshot({ sku: 'A' })], [entry({ sku: 'A', stock: 0, inStock: false })])

    expect(result.outOfStock).toEqual(['A'])
    expect(result.discontinued).toEqual([])
  })

  it('needs a SKU to be absent for the configured number of syncs', () => {
    setPricingOverrides({ discontinuedAfterMissedSyncs: 3 })

    // Sync 1 and 2: missing, but not yet gone for good.
    let prev = [snapshot({ sku: 'A' })]
    for (const expectedMissed of [1, 2]) {
      const result = diffSupplierFeed(prev, [], { now: NOW, config: getPricingConfig() })
      expect(result.discontinued).toEqual([])
      expect(result.next[0].missedSyncs).toBe(expectedMissed)
      prev = result.next
    }

    // Sync 3 crosses the threshold.
    const third = diffSupplierFeed(prev, [], { now: NOW, config: getPricingConfig() })
    expect(third.discontinued).toEqual(['A'])
  })

  it('resets the absence streak the moment a SKU flickers back', () => {
    // A feed that drops a SKU intermittently must never accumulate its way to
    // "discontinued" — that would permanently change someone's plan over a
    // supplier hiccup.
    setPricingOverrides({ discontinuedAfterMissedSyncs: 3 })
    const config = getPricingConfig()

    let prev = diffSupplierFeed([snapshot({ sku: 'A' })], [], { now: NOW, config }).next
    expect(prev[0].missedSyncs).toBe(1)

    prev = diffSupplierFeed(prev, [entry({ sku: 'A' })], { now: NOW, config }).next
    expect(prev[0].missedSyncs).toBe(0)

    const afterOneMore = diffSupplierFeed(prev, [], { now: NOW, config })
    expect(afterOneMore.discontinued).toEqual([])
  })

  it('says nothing about a SKU it is seeing for the first time', () => {
    // New products are new, not broken — but they are snapshotted so the next
    // run has something to compare against.
    const result = diff([], [entry({ sku: 'NEW', inStock: false, stock: 0 })])

    expect(result.outOfStock).toEqual([])
    expect(result.next.map((s) => s.sku)).toEqual(['NEW'])
  })
})

describe('recovery', () => {
  it('reports a SKU that is buyable again after being out of stock', () => {
    const result = diff([snapshot({ sku: 'A', inStock: false, stock: 0 })], [entry({ sku: 'A' })])
    expect(result.recovered).toEqual(['A'])
  })

  it('reports a SKU that is back after being absent from the feed', () => {
    const result = diff([snapshot({ sku: 'A', missedSyncs: 2 })], [entry({ sku: 'A' })])
    expect(result.recovered).toEqual(['A'])
  })

  it('says nothing about a SKU that was fine and still is', () => {
    expect(diff([snapshot({ sku: 'A' })], [entry({ sku: 'A' })]).recovered).toEqual([])
  })
})

describe('price moves', () => {
  it('reports a move beyond the threshold, with the direction preserved', () => {
    setPricingOverrides({ priceChangeThresholdPct: 0.02 })
    const result = diff([snapshot({ sku: 'A', wholesalePrice: 10 })], [entry({ sku: 'A', wholesalePrice: 12 })])

    expect(result.priceMoves).toHaveLength(1)
    expect(result.priceMoves[0].move).toMatchObject({
      previousWholesale: 10,
      newWholesale: 12,
      wholesaleDeltaPct: 0.2,
    })
  })

  it('reports a decrease as a negative delta', () => {
    const result = diff([snapshot({ sku: 'A', wholesalePrice: 10 })], [entry({ sku: 'A', wholesalePrice: 9 })])
    expect(result.priceMoves[0].move.wholesaleDeltaPct).toBe(-0.1)
  })

  it('ignores noise below the threshold', () => {
    setPricingOverrides({ priceChangeThresholdPct: 0.05 })
    const result = diffSupplierFeed(
      [snapshot({ sku: 'A', wholesalePrice: 10 })],
      [entry({ sku: 'A', wholesalePrice: 10.2 })],
      { now: NOW, config: getPricingConfig() },
    )
    expect(result.priceMoves).toEqual([])
  })
})

describe('mapping SKUs onto the people they affect', () => {
  const catalogue = [
    { ...product({ id: 'whey-a' }), variants: [{ ...product({ id: 'whey-a' }).variants[0], sku: 'SKU-A' }] },
    { ...product({ id: 'whey-b' }), variants: [{ ...product({ id: 'whey-b' }).variants[0], sku: 'SKU-B' }] },
  ] as ReturnType<typeof product>[]

  const subs = [
    { userId: 'u1', subscription: subscriptionWith([line({ id: 'l1', productId: 'whey-a' })]) },
    { userId: 'u2', subscription: subscriptionWith([line({ id: 'l2', productId: 'whey-b' })]) },
  ]

  it('resolves a line to its supplier SKU through the catalogue variant', () => {
    expect(skuForLine({ productId: 'whey-a', variantTitle: '' }, catalogue)).toBe('SKU-A')
    expect(skuForLine({ productId: 'ghost', variantTitle: '' }, catalogue)).toBeNull()
  })

  it('finds only the members actually holding the affected SKU', () => {
    const affected = findAffectedLines({ outOfStock: ['SKU-A'], discontinued: [] }, subs, catalogue)

    expect(affected).toHaveLength(1)
    expect(affected[0]).toMatchObject({ userId: 'u1', sku: 'SKU-A', kind: 'out-of-stock' })
  })

  it('lets discontinued win over out-of-stock for the same SKU', () => {
    // Otherwise one product would sit in the queue twice, saying two different
    // things about how permanent it is.
    const affected = findAffectedLines({ outOfStock: ['SKU-A'], discontinued: ['SKU-A'] }, subs, catalogue)

    expect(affected).toHaveLength(1)
    expect(affected[0].kind).toBe('discontinued')
  })

  it('does no work when nothing is unavailable', () => {
    expect(findAffectedLines({ outOfStock: [], discontinued: [] }, subs, catalogue)).toEqual([])
  })
})

describe('inStockCatalogue', () => {
  it('excludes products whose only variant is unavailable', () => {
    const catalogue = [
      { ...product({ id: 'a' }), variants: [{ ...product({ id: 'a' }).variants[0], sku: 'SKU-A' }] },
      { ...product({ id: 'b' }), variants: [{ ...product({ id: 'b' }).variants[0], sku: 'SKU-B' }] },
    ] as ReturnType<typeof product>[]

    expect(inStockCatalogue(catalogue, new Set(['SKU-A'])).map((p) => p.id)).toEqual(['b'])
  })
})
