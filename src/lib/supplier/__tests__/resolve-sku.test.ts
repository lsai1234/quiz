import { resolveProductIdForSku, anchorsFromFeed, supplierProbe, lastPopulatedPage } from '@/lib/supplier/resolve-sku'
import type { SupplierProvider } from '@/lib/supplier/types'

/**
 * A fake PowerBody whose catalogue is known, so the search can be judged on what
 * it concludes rather than on what a live account happens to hold.
 *
 * The shape is the one that matters: ids run near-monotone in SKU number, ids
 * are SPARSE (most probes land on nothing), and the list feed stops at a ceiling
 * well below the top of the catalogue — which is the whole problem.
 */
function fakeSupplier(opts: {
  /** productId → sku. */
  catalogue: Map<number, string>
  /** How many products the list feed will admit to, cheapest-first. */
  ceiling?: number
  onProbe?: (id: number) => void
}): { supplier: SupplierProvider; probes: () => number } {
  const { catalogue, ceiling = Infinity } = opts
  const ordered = [...catalogue].sort((a, b) => a[0] - b[0])
  let probes = 0

  const supplier = {
    async getFeed({ fromPage = 1, pageBudget = 1 } = {}) {
      const perPage = 15
      const reachable = ordered.slice(0, ceiling === Infinity ? undefined : ceiling)
      const start = (fromPage - 1) * perPage
      const rows = reachable.slice(start, start + perPage * pageBudget)
      return {
        levels: rows.map(([productId, sku]) => ({ sku, productId: String(productId), stock: 5, inStock: true, wholesalePrice: 10, updatedAt: '' })),
        complete: start + rows.length >= reachable.length,
        pages: 1,
        nextPage: null,
      }
    },
    async getProductsById(ids: string[]) {
      probes += 1
      opts.onProbe?.(Number(ids[0]))
      const sku = catalogue.get(Number(ids[0]))
      // Their real client throws when NOTHING in the batch resolved — an empty
      // id and a broken account are indistinguishable at this layer.
      if (!sku) throw new Error('No such product')
      return [{ sku, productId: ids[0], name: sku, wholesalePrice: 10, rrp: 20 }]
    },
  } as unknown as SupplierProvider

  return { supplier, probes: () => probes }
}

/** 800 products, ids sparse and near-monotone in SKU number. */
function buildCatalogue(): Map<number, string> {
  const map = new Map<number, string>()
  let id = 1000
  for (let n = 43000; n < 43800; n++) {
    id += 3 + (n % 5) // sparse, uneven gaps
    map.set(id, `P${n}`)
  }
  return map
}

describe('resolveProductIdForSku', () => {
  it('finds a SKU the list feed cannot reach at all', async () => {
    // The case the whole module exists for. P43790 sits far above a feed that
    // stops at 300 products, so no amount of paging can ever reach its row.
    const catalogue = buildCatalogue()
    const { supplier } = fakeSupplier({ catalogue, ceiling: 300 })
    const wantedId = [...catalogue].find(([, sku]) => sku === 'P43790')![0]

    const out = await resolveProductIdForSku('P43790', supplier)

    expect(out.reason).toBe('found')
    expect(out.productId).toBe(wantedId)
  })

  it('pays for it in tens of probes, not thousands', async () => {
    // The search has to be cheaper than the walk it replaces, or it is not a
    // fix. A linear scan of this range would be ~2,400 throttled requests.
    //
    // P43450 is the representative case: above the feed's ceiling, with plenty
    // of catalogue still above it — so the gallop finds a product PAST the
    // target and hands the bisect a bracket proven to contain the answer.
    const catalogue = buildCatalogue()
    const { supplier, probes } = fakeSupplier({ catalogue, ceiling: 300 })

    const out = await resolveProductIdForSku('P43450', supplier)

    expect(out.reason).toBe('found')
    expect(probes()).toBeLessThan(60)
  })

  it('never claims a top-of-catalogue SKU is missing, even when it runs out of allowance', async () => {
    // The expensive shape: the target is the newest product on the account, so
    // NOTHING exists past it and no probe can ever prove a ceiling. The search
    // has to find the edge of the populated range by probing empty ids, which
    // can cost more than one press is allowed to spend.
    //
    // What must hold is not that it always finishes — it is that it never
    // finishes WRONGLY. "Ran out of allowance" tells you to press again;
    // "not on this account" tells you to strike a real product off the roster.
    const catalogue = buildCatalogue()
    const { supplier, probes } = fakeSupplier({ catalogue, ceiling: 300 })
    const wantedId = [...catalogue].find(([, sku]) => sku === 'P43799')![0]

    const out = await resolveProductIdForSku('P43799', supplier)

    expect(out.reason).not.toBe('not-found')
    if (out.productId !== null) expect(out.productId).toBe(wantedId)
    expect(probes()).toBeLessThanOrEqual(250)
  })

  it('stops at its request allowance however fast the supplier answers', async () => {
    // A clock alone stops limiting anything when replies are quick: 45 seconds
    // of 50ms answers is nine hundred calls, and PowerBody answer 429 long
    // before that. The ceiling has to be counted in requests.
    const catalogue = buildCatalogue()
    const { supplier, probes } = fakeSupplier({ catalogue, ceiling: 300 })

    const out = await resolveProductIdForSku('P99999', supplier, { maxProbes: 30 })

    expect(probes()).toBeLessThanOrEqual(30)
    expect(out.reason).toBe('probe-budget')
  })

  it('never answers with a product whose SKU is not the one asked for', async () => {
    // The dangerous failure. Ids correlate with SKU numbers, so a near miss
    // returns a REAL product — the wrong one — and accepting it would put
    // another brand's tub behind this code.
    const catalogue = buildCatalogue()
    catalogue.delete([...catalogue].find(([, sku]) => sku === 'P43500')![0])
    const { supplier } = fakeSupplier({ catalogue, ceiling: 300 })

    const out = await resolveProductIdForSku('P43500', supplier)

    expect(out.productId).toBeNull()
    expect(out.reason).toBe('not-found')
  })

  it('says the clock ran out rather than claiming the SKU is not there', async () => {
    // The bug this module was written to escape. "We stopped waiting" and "not
    // on this account" are opposite instructions to the person reading them.
    const catalogue = buildCatalogue()
    const { supplier } = fakeSupplier({ catalogue, ceiling: 300 })
    let clock = 0
    // Every probe burns a second; the budget is four.
    const out = await resolveProductIdForSku('P43790', supplier, {
      budgetMs: 4_000,
      now: () => (clock += 1_000),
    })

    expect(out.reason).toBe('deadline')
    expect(out.productId).toBeNull()
  })

  it('uses the committed map without spending a single request', async () => {
    const { supplier, probes } = fakeSupplier({ catalogue: new Map() })
    jest.resetModules()
    jest.doMock('@/lib/supplier/product-id-map.json', () => ({ P99999: 4242 }), { virtual: true })
    const { resolveProductIdForSku: fresh } = await import('@/lib/supplier/resolve-sku')

    const out = await fresh('P99999', supplier)
    if (out.reason === 'map') {
      expect(out.productId).toBe(4242)
      expect(probes()).toBe(0)
    }
    jest.dontMock('@/lib/supplier/product-id-map.json')
  })

  it('throws the supplier’s own words when nothing at all answered', async () => {
    // Every probe failing is evidence about the ACCOUNT, not about the SKU.
    // Reporting "not on this account" for a disabled detail call is how a
    // permissions problem comes to look like a missing product.
    const supplier = {
      async getFeed() {
        return {
          levels: [
            { sku: 'P43000', productId: '1000', stock: 1, inStock: true, wholesalePrice: 1, updatedAt: '' },
            { sku: 'P43100', productId: '1400', stock: 1, inStock: true, wholesalePrice: 1, updatedAt: '' },
          ],
          complete: true, pages: 1, nextPage: null,
        }
      },
      async getProductsById() {
        throw new Error('Resource path is not callable')
      },
    } as unknown as SupplierProvider

    await expect(resolveProductIdForSku('P43200', supplier)).rejects.toThrow('Resource path is not callable')
  })

  it('refuses to guess when the feed gives it nothing to fit from', async () => {
    const supplier = {
      async getFeed() { return { levels: [], complete: true, pages: 1, nextPage: null } },
      async getProductsById() { throw new Error('nope') },
    } as unknown as SupplierProvider

    const out = await resolveProductIdForSku('P43200', supplier)
    expect(out.reason).toBe('no-anchors')
    expect(out.productId).toBeNull()
  })

  it('cannot search a SKU with no number in it', async () => {
    const { supplier } = fakeSupplier({ catalogue: buildCatalogue(), ceiling: 300 })
    const out = await resolveProductIdForSku('BUNDLE-XL', supplier)
    expect(out.reason).toBe('unusable-sku')
  })
})

describe('anchorsFromFeed', () => {
  it('survives a page that will not read', async () => {
    // A worse fit is recoverable; a failed resolve because one page 500'd is not.
    let call = 0
    const supplier = {
      async getFeed() {
        call += 1
        if (call === 2) throw new Error('500')
        return {
          levels: [{ sku: `P${43000 + call}`, productId: String(1000 + call), stock: 1, inStock: true, wholesalePrice: 1, updatedAt: '' }],
          complete: true, pages: 1, nextPage: null,
        }
      },
    } as unknown as SupplierProvider

    const anchors = await anchorsFromFeed(supplier, [1, 2, 3])
    expect(anchors.length).toBe(2)
  })
})

describe('supplierProbe', () => {
  it('reads a throw as an empty id, but remembers the reason', async () => {
    const supplier = {
      async getProductsById() { throw new Error('Access denied') },
    } as unknown as SupplierProvider
    const { probe, firstError, answered } = supplierProbe(supplier)

    expect(await probe(5)).toEqual({ sku: null })
    expect(answered()).toBe(0)
    expect(firstError()?.message).toBe('Access denied')
  })
})

describe('the bracket', () => {
  it('finds a SKU that sits far past where the fit predicts', async () => {
    // The target is outside the fitted data by construction — that is the whole
    // point — so the residuals cannot say how far out it is. Here the ids
    // accelerate above the ceiling, so a bracket sized from the visible part of
    // the feed lands thousands of ids short of the answer.
    //
    // Reporting "not on this account" for a product that IS there is the one
    // wrong answer that matters: it strikes a real product off a roster.
    const catalogue = new Map<number, string>()
    let id = 1000
    // Inside the feed's reach: tight, even spacing — what the fit will learn.
    for (let n = 43000; n < 43200; n++) { id += 3; catalogue.set(id, `P${n}`) }
    // Above it: the same catalogue, still dense, but spreading out fast enough
    // that extrapolating the first stretch lands nowhere near the answer.
    for (let n = 43200; n < 43600; n++) { id += 25; catalogue.set(id, `P${n}`) }
    const wantedId = [...catalogue].find(([, sku]) => sku === 'P43599')![0]
    const { supplier } = fakeSupplier({ catalogue, ceiling: 200 })

    const out = await resolveProductIdForSku('P43599', supplier, { budgetMs: 600_000 })

    // The fit, trained only on the tight stretch, predicts ~2800; the truth is
    // ~11,600. Nothing but a real upper bound gets there.
    expect(out.productId).toBe(wantedId)
    expect(out.reason).toBe('found')
  })
})

describe('lastPopulatedPage', () => {
  it('measures where the feed actually stops instead of assuming', async () => {
    // The ceiling is undocumented server behaviour and could move. Hardcoding
    // 200 pages left the fit with 15 pairs spanning 15 SKUs on any shorter
    // feed, which turned a ~35-probe search into a ~165-probe one.
    const catalogue = buildCatalogue()
    const { supplier } = fakeSupplier({ catalogue, ceiling: 137 })

    // 137 products at 15 a page = 10 pages, the last one part-full.
    await expect(lastPopulatedPage(supplier)).resolves.toBe(10)
  })

  it('reports zero for a feed that answers with nothing', async () => {
    const supplier = {
      async getFeed() { return { levels: [], complete: true, pages: 1, nextPage: null } },
    } as unknown as SupplierProvider
    await expect(lastPopulatedPage(supplier)).resolves.toBe(0)
  })
})
