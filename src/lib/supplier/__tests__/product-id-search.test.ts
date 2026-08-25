import { findProductIdForSku, sweepForSku, fitIdFromSku, skuNumber } from '@/lib/supplier/product-id-search'

/**
 * A fake catalogue: ids mapped to SKUs, everything else empty.
 *
 * Sparse on purpose. The real id space holds 3,000 products across 108,630 ids,
 * so most probes land on nothing — and an algorithm that only works on a dense
 * range would look fine here and fail on the wire.
 */
function catalogue(entries: Record<number, string>) {
  const probes: number[] = []
  return {
    probes,
    probe: async (id: number) => {
      probes.push(id)
      return { sku: entries[id] ?? null }
    },
  }
}

/** ids ascending with SKU numbers ascending, one product every `gap` ids. */
function monotoneRange(startId: number, startSku: number, count: number, gap = 3) {
  const entries: Record<number, string> = {}
  for (let i = 0; i < count; i++) entries[startId + i * gap] = `P${startSku + i}`
  return entries
}

describe('skuNumber', () => {
  it('reads the number out of a PowerBody code', () => {
    expect(skuNumber('P44338')).toBe(44338)
  })

  it('is null for a code with no number, so it is never compared as zero', () => {
    expect(skuNumber('PB-WHEY')).toBeNull()
  })
})

describe('findProductIdForSku', () => {
  it('finds a SKU by bisecting on the SKU the probe returns', async () => {
    const { probe, probes } = catalogue(monotoneRange(110_000, 43_000, 400))
    const out = await findProductIdForSku({ target: 'P43200', lo: 110_000, hi: 112_000, probe })

    expect(out.productId).toBe(110_000 + 200 * 3)
    expect(out.reason).toBe('found')
    // A bisect, not a sweep: 400 products must not cost 400 calls.
    expect(probes.length).toBeLessThan(40)
  })

  /**
   * The safety property the whole approach rests on. Ids and SKU numbers
   * correlate, so a near miss returns a REAL product — the wrong one — and
   * accepting it would import another brand's product under our SKU.
   */
  it('never returns an id whose SKU is not an exact match', async () => {
    // P43200 is absent; its neighbours are not.
    const entries = monotoneRange(110_000, 43_000, 400)
    delete entries[110_000 + 200 * 3]
    const { probe } = catalogue(entries)

    const out = await findProductIdForSku({ target: 'P43200', lo: 110_000, hi: 112_000, probe })
    expect(out.productId).toBeNull()
  })

  /**
   * An empty id carries no direction. Bisecting on one would throw away half the
   * range on no evidence — the flaw in the obvious implementation, and the one
   * that loses products silently.
   */
  it('steps off an empty id to a real neighbour rather than guessing a direction', async () => {
    // Products sit on even ids only, and the midpoint of this window is odd —
    // so every bisect step lands on nothing and has to find a real neighbour
    // before it can pick a side.
    const { probe } = catalogue(monotoneRange(100_000, 40_000, 50, 2))
    const out = await findProductIdForSku({ target: 'P40010', lo: 100_000, hi: 100_098, probe })

    expect(out.productId).toBe(100_020)
    expect(out.reason).toBe('found')
  })

  /**
   * The contract's one real limit, stated rather than discovered later: the
   * bracket has to be roughly where the products are. Given a window vastly
   * wider than the cluster, the scan around each midpoint finds nothing and the
   * search reports `exhausted`.
   *
   * That is the SAFE failure — it declines to answer rather than returning a
   * neighbour — and the caller's job is to bracket from the fit (the backfill
   * uses predicted ±6,000, where density is about one product every three ids)
   * and to fall back to `sweepForSku`.
   */
  it('declines rather than answering when the bracket is nowhere near the products', async () => {
    const { probe } = catalogue(monotoneRange(100_000, 40_000, 50, 2))
    const out = await findProductIdForSku({ target: 'P40010', lo: 100_000, hi: 200_000, probe })

    expect(out.productId).toBeNull()
    expect(out.reason).toBe('exhausted')
  })

  it('gives up rather than spending an unbounded number of calls', async () => {
    const { probe, probes } = catalogue({})
    const out = await findProductIdForSku({
      target: 'P50000',
      lo: 1,
      hi: 1_000_000,
      probe,
      maxProbes: 25,
    })

    expect(out.productId).toBeNull()
    expect(probes.length).toBeLessThanOrEqual(25)
    expect(['probe-budget', 'exhausted']).toContain(out.reason)
  })

  it('does not pay twice for the same id', async () => {
    const { probe, probes } = catalogue(monotoneRange(110_000, 43_000, 200))
    await findProductIdForSku({ target: 'P43100', lo: 110_000, hi: 111_000, probe })

    expect(new Set(probes).size).toBe(probes.length)
  })

  it('reports nothing found when the range is genuinely empty', async () => {
    const { probe } = catalogue({})
    const out = await findProductIdForSku({ target: 'P44338', lo: 1000, hi: 1200, probe })

    expect(out).toMatchObject({ productId: null, reason: 'exhausted' })
  })
})

describe('sweepForSku', () => {
  /**
   * Why the sweep exists: the ordering is NEAR monotone, not monotone — about
   * 92 inversions across 3,000 real pairs — and a product on the wrong side of
   * one is invisible to a bisect while sitting yards from the prediction.
   */
  it('finds a product a bisect would step past, because the order is inverted there', async () => {
    const entries = monotoneRange(110_000, 43_000, 100)
    // An inversion: a high SKU sitting at a low id.
    entries[110_015] = 'P43900'
    const { probe } = catalogue(entries)

    const bisect = await findProductIdForSku({ target: 'P43900', lo: 110_000, hi: 110_300, probe })
    expect(bisect.productId).toBeNull()

    const swept = await sweepForSku({ target: 'P43900', centre: 110_020, radius: 30, probe })
    expect(swept.productId).toBe(110_015)
  })

  it('holds to the same exact-match rule as the bisect', async () => {
    const { probe } = catalogue({ 500: 'P43901', 501: 'P43903' })
    const out = await sweepForSku({ target: 'P43902', centre: 500, radius: 10, probe })

    expect(out.productId).toBeNull()
  })
})

describe('fitIdFromSku', () => {
  it('predicts an id in the right region from known pairs', () => {
    const pairs = Array.from({ length: 100 }, (_, i) => ({ sku: `P${43_000 + i}`, productId: 110_000 + i * 2 }))
    const predict = fitIdFromSku(pairs)

    // Extrapolating 50 SKUs past the end: 110000 + 150*2.
    expect(predict('P43150')).toBeCloseTo(110_300, -1)
  })

  it('is null for a SKU with no number rather than predicting from zero', () => {
    const predict = fitIdFromSku([{ sku: 'P1', productId: 10 }, { sku: 'P2', productId: 20 }])
    expect(predict('WHEY')).toBeNull()
  })

  it('survives too little data to fit anything', () => {
    expect(fitIdFromSku([])('P1')).toBeNull()
    expect(fitIdFromSku([{ sku: 'P1', productId: 5 }])('P1')).toBeNull()
  })
})
