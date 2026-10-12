/**
 * @jest-environment node
 */
import type { SupplierProduct, SupplierProvider } from '../types'
import type { SupplierIndex } from '@/lib/portal/supplier-index'
import { PowerBodySoapError } from '../powerbody/soap'

/*
  The resolver's collaborators, replaced so each answer can be judged on what it
  concludes: the stored index and its memory, the committed id map (empty in
  the repo, so a test that wants a "map" id has to supply one), and the id
  search, whose own behaviour is pinned in resolve-sku.test.ts.
*/
jest.mock('@/lib/portal/supplier-index', () => ({
  readSupplierIndex: jest.fn(),
  rememberIndexed: jest.fn(async () => undefined),
}))
jest.mock('@/lib/supplier/product-id-map', () => ({
  productIdForSku: jest.fn(() => null),
}))
jest.mock('@/lib/supplier/resolve-sku', () => ({
  resolveProductIdForSku: jest.fn(),
}))

import { readSupplierIndex, rememberIndexed } from '@/lib/portal/supplier-index'
import { productIdForSku } from '@/lib/supplier/product-id-map'
import { resolveProductIdForSku, type ResolveOutcome } from '@/lib/supplier/resolve-sku'
import { normaliseCode, quickResolve, refusalOf, resolveCode } from '../resolve-code'

const remembered = rememberIndexed as jest.MockedFunction<typeof rememberIndexed>
const readIndex = readSupplierIndex as jest.MockedFunction<typeof readSupplierIndex>
const mapped = productIdForSku as jest.MockedFunction<typeof productIdForSku>
const search = resolveProductIdForSku as jest.MockedFunction<typeof resolveProductIdForSku>

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = Date.parse('2026-10-12T10:00:00.000Z')
const DAY = 86_400_000
const now = () => NOW

/** A product as PowerBody's detail call returns it. */
function pbProduct(sku: string, productId: string | null, over: Partial<SupplierProduct> = {}): SupplierProduct {
  return {
    sku,
    productId,
    name: `${sku} — Applied Nutrition Critical Whey 2kg`,
    brand: 'Applied Nutrition',
    category: 'Protein',
    description: 'Whey protein blend.',
    imageUrl: `https://cdn.powerbody.co.uk/media/${sku}.jpg`,
    wholesalePrice: 24.5,
    rrp: 44.99,
    currency: 'GBP',
    stock: 12,
    inStock: true,
    barcode: null,
    flavours: [],
    servings: 66,
    weightGrams: 2150,
    vatRate: 0.2,
    detailed: true,
    updatedAt: '2026-10-12T09:00:00.000Z',
    ...over,
  }
}

/**
 * A fake PowerBody: `catalogue` is id → SKU. Unknown ids come back as nothing
 * (or, with `throwOnEmpty`, as the throw their real client makes when nothing
 * in a batch resolved). `refuse` makes a call throw before it is answered.
 */
function fakeSupplier(
  catalogue: Record<string, string>,
  opts: {
    name?: 'mock' | 'powerbody'
    refuse?: (ids: string[]) => unknown
    throwOnEmpty?: boolean
    bySku?: SupplierProduct[]
  } = {},
): { supplier: SupplierProvider; asked: string[][]; skuCalls: string[][] } {
  const asked: string[][] = []
  const skuCalls: string[][] = []
  const supplier = {
    name: opts.name ?? 'powerbody',
    async getProductsById(ids: string[]) {
      asked.push([...ids])
      const refusal = opts.refuse?.(ids)
      if (refusal) throw refusal
      const found = ids.filter((id) => catalogue[id]).map((id) => pbProduct(catalogue[id], id))
      if (found.length === 0 && opts.throwOnEmpty) throw new Error('Product not found')
      return found
    },
    async getProductsBySku(skus: string[]) {
      skuCalls.push([...skus])
      return (opts.bySku ?? []).filter((p) => skus.includes(p.sku))
    },
  } as unknown as SupplierProvider
  return { supplier, asked, skuCalls }
}

/** A stored index: SKU → id. */
function storedIndex(bySku: Record<string, string>, over: Partial<SupplierIndex> = {}): SupplierIndex {
  return {
    bySku: Object.fromEntries(Object.entries(bySku).map(([sku, productId]) => [sku, { productId, qty: 4, price: 20 }])),
    pagesRead: 200,
    complete: false,
    updatedAt: new Date(NOW - DAY).toISOString(),
    resumeFrom: null,
    sweptTo: null,
    sweptIds: 0,
    sweptFound: 0,
    sweptEmptyRun: 0,
    sweepComplete: false,
    ...over,
  }
}

function outcome(over: Partial<ResolveOutcome>): ResolveOutcome {
  return { productId: null, probes: 0, reason: 'not-found', anchors: 0, bracket: null, trace: [], ...over }
}

/** Every {sku, productId} handed to the index's memory, across all calls. */
function rememberedPairs(): Array<{ sku: string; productId: string }> {
  return remembered.mock.calls.flatMap(([pairs]) => pairs.map((p) => ({ sku: p.sku, productId: p.productId })))
}

beforeEach(() => {
  jest.clearAllMocks()
  mapped.mockImplementation(() => null)
  readIndex.mockResolvedValue(storedIndex({}))
  search.mockResolvedValue(outcome({ reason: 'not-found', bracket: { lo: 1, hi: 2 } }))
})

// ── normaliseCode / refusalOf ────────────────────────────────────────────────

describe('normaliseCode', () => {
  it('writes a code the way PowerBody do: no spaces, upper case', () => {
    expect(normaliseCode('  p 443 38 ')).toBe('P44338')
    expect(normaliseCode('mp-iw-choc')).toBe('MP-IW-CHOC')
    expect(normaliseCode('   ')).toBe('')
  })
})

describe('refusalOf — why PowerBody would not answer decides the fix', () => {
  it('reads a retryable SOAP fault as a rate limit, whatever it says', () => {
    const why = refusalOf(new PowerBodySoapError('Service Unavailable', '503', false, true))
    expect(why.kind).toBe('rate-limited')
    expect(why.next).toEqual(['wait', 'search-again'])
    expect(why.message).toContain('Service Unavailable')
  })

  it('reads 429, "too many" and throttling text as a rate limit', () => {
    for (const text of ['HTTP 429', 'Too many requests', 'Request throttled', 'rate limit exceeded', 'Please slow down']) {
      expect(refusalOf(new Error(text)).kind).toBe('rate-limited')
    }
  })

  it('does not read a non-retryable SOAP fault as a rate limit on its class alone', () => {
    expect(refusalOf(new PowerBodySoapError('Product not found', 'x', false, false)).kind).toBe('supplier-error')
  })

  it('reads a DEMO / sandbox answer as the sandbox account', () => {
    expect(refusalOf(new Error('This is a DEMO account')).kind).toBe('sandbox')
    expect(refusalOf(new Error('Method not enabled for this user')).kind).toBe('sandbox')
    expect(refusalOf(new Error('sandbox')).next).toEqual(['ask-powerbody', 'run-checks'])
  })

  it('reads a login failure as credentials, sending the founder to Settings', () => {
    for (const text of ['Invalid login', 'Access denied', 'Bad API key', 'invalid session id', 'Not authorised']) {
      const why = refusalOf(new Error(text))
      expect(why.kind).toBe('credentials')
      expect(why.next).toEqual(['open-settings', 'run-checks'])
    }
  })

  it('reports anything else as a supplier error, in their words', () => {
    const why = refusalOf('Internal error 0x12')
    expect(why.kind).toBe('supplier-error')
    expect(why.message).toBe('PowerBody would not answer: Internal error 0x12')
    expect(why.next).toEqual(['run-checks', 'search-again'])
  })
})

// ── resolveCode ──────────────────────────────────────────────────────────────

describe('resolveCode — a code that is all digits', () => {
  it('is asked for as a product id first, and says which SKU it is', async () => {
    const { supplier, asked } = fakeSupplier({ '44338': 'P51200' })
    const r = await resolveCode('44338', { supplier, index: storedIndex({}), now })

    expect(r).toMatchObject({ status: 'found', kind: 'id', via: 'id', productId: '44338' })
    expect(r.product?.sku).toBe('P51200')
    expect(r.message).toContain('SKU P51200')
    expect(r.alsoMeant).toBeUndefined()
    expect(asked).toEqual([['44338']])
    expect(search).not.toHaveBeenCalled()
  })

  it('offers the SKU reading too when P+code is a different product we know of', async () => {
    // "44338" might be id 44338, or SKU P44338 with the P lost in a spreadsheet.
    const { supplier } = fakeSupplier({ '44338': 'P51200', '90210': 'P44338' })
    const r = await resolveCode('44338', { supplier, index: storedIndex({ P44338: '90210' }), now })

    expect(r).toMatchObject({ status: 'found', kind: 'id', productId: '44338' })
    expect(r.alsoMeant).toEqual({ code: 'P44338', productId: '90210' })
  })

  it('offers nothing more when P+code is held under that very id', async () => {
    const { supplier } = fakeSupplier({ '44338': 'P44338' })
    const r = await resolveCode('44338', { supplier, index: storedIndex({ P44338: '44338' }), now })
    expect(r.status).toBe('found')
    expect(r.alsoMeant).toBeUndefined()
  })

  it('falls back to SKU P+code when no product has that id but the SKU is known', async () => {
    const { supplier, asked } = fakeSupplier({ '90210': 'P44338' })
    const r = await resolveCode('44338', { supplier, index: storedIndex({ P44338: '90210' }), now })

    expect(r).toMatchObject({ status: 'found', kind: 'sku', via: 'index', productId: '90210' })
    expect(r.product?.sku).toBe('P44338')
    expect(r.message).toMatch(/No product has id 44338, but SKU P44338 is/)
    expect(asked).toEqual([['44338'], ['90210']])
    expect(search).not.toHaveBeenCalled()
  })

  it('falls back the same way when their client throws for an id that is not there', async () => {
    const { supplier } = fakeSupplier({ '90210': 'P44338' }, { throwOnEmpty: true })
    const r = await resolveCode('44338', { supplier, index: storedIndex({ P44338: '90210' }), now })
    expect(r).toMatchObject({ status: 'found', via: 'index', productId: '90210' })
  })

  it('goes on as a SKU when neither reading is known, and says the id was not there', async () => {
    const { supplier } = fakeSupplier({})
    const r = await resolveCode('44338', {
      supplier,
      index: storedIndex({ P1: '1' }, { complete: true }),
      now,
    })
    expect(r.status).toBe('not-on-account')
    expect(r.message).toContain('PowerBody have no product with id 44338.')
  })

  it('stops with the refusal when the id call itself is rate-limited, rather than searching into it', async () => {
    const { supplier } = fakeSupplier({}, { refuse: () => new PowerBodySoapError('HTTP 503', '503', false, true) })
    const r = await resolveCode('44338', { supplier, index: storedIndex({}), now })
    expect(r).toMatchObject({ status: 'refused', refusal: 'rate-limited' })
    expect(search).not.toHaveBeenCalled()
  })

  it('a pasted id for another card’s SKU is the wrong product', async () => {
    const { supplier } = fakeSupplier({ '44338': 'P51200' })
    const r = await resolveCode('44338', { supplier, index: storedIndex({}), expectSku: ' p60001 ', now })

    expect(r).toMatchObject({ status: 'wrong-product', kind: 'id', next: ['paste-id'] })
    expect(r.message).toContain('P51200')
    expect(r.message).toContain('not P60001')
    expect(r.product).toBeUndefined()
    expect(remembered).not.toHaveBeenCalled()
  })

  it('a pasted id that matches the card is found', async () => {
    const { supplier } = fakeSupplier({ '44338': 'P51200' })
    const r = await resolveCode('44338', { supplier, index: storedIndex({}), expectSku: 'P51200', now })
    expect(r.status).toBe('found')
  })

  it('remembers what the id turned out to be', async () => {
    const { supplier } = fakeSupplier({ '44338': 'P51200' })
    await resolveCode('44338', { supplier, index: storedIndex({}), now })
    expect(rememberedPairs()).toContainEqual({ sku: 'P51200', productId: '44338' })
  })
})

describe('resolveCode — an id we already hold for the SKU', () => {
  it('checks the saved, mapped and indexed ids in turn and uses only one that answers for this SKU', async () => {
    mapped.mockImplementation((sku) => (sku === 'P60001' ? 200 : null))
    const { supplier, asked } = fakeSupplier({ '100': 'P11111', '200': 'P22222', '300': 'P60001' })
    const r = await resolveCode('p60001', {
      supplier,
      savedIdFor: (sku) => (sku === 'P60001' ? '100' : null),
      index: storedIndex({ P60001: '300' }),
      now,
    })

    expect(r).toMatchObject({ status: 'found', kind: 'sku', via: 'index', productId: '300' })
    expect(asked).toEqual([['100'], ['200'], ['300']])
    expect(r.trace.filter((s) => /no longer answers for P60001/.test(s.message))).toHaveLength(2)
    expect(search).not.toHaveBeenCalled()
  })

  it('says which held id answered: saved first', async () => {
    const { supplier, asked } = fakeSupplier({ '100': 'P60001', '300': 'P60001' })
    const r = await resolveCode('P60001', {
      supplier,
      savedIdFor: () => '100',
      index: storedIndex({ P60001: '300' }),
      now,
    })
    expect(r).toMatchObject({ status: 'found', via: 'saved', productId: '100' })
    expect(asked).toEqual([['100']])
  })

  it('uses the committed map', async () => {
    mapped.mockImplementation(() => 200)
    const { supplier } = fakeSupplier({ '200': 'P60001' })
    const r = await resolveCode('P60001', { supplier, index: storedIndex({}), now })
    expect(r).toMatchObject({ status: 'found', via: 'map', productId: '200' })
  })

  it('asks once for an id held in more than one place', async () => {
    const { supplier, asked } = fakeSupplier({ '300': 'P60001' })
    await resolveCode('P60001', { supplier, savedIdFor: () => '300', index: storedIndex({ P60001: '300' }), now })
    expect(asked).toEqual([['300']])
  })

  it('ignores a saved "id" that is not a number', async () => {
    const { supplier, asked } = fakeSupplier({})
    await resolveCode('P60001', { supplier, savedIdFor: () => 'n/a', index: storedIndex({}), now })
    expect(asked).toEqual([])
  })

  it('searches when every held id has moved to another product', async () => {
    const { supplier } = fakeSupplier({ '300': 'P99999' })
    search.mockImplementation(async () => outcome({ reason: 'deadline', probes: 12 }))
    const r = await resolveCode('P60001', { supplier, index: storedIndex({ P60001: '300' }), now })
    expect(search).toHaveBeenCalledTimes(1)
    expect(r.status).toBe('not-yet')
  })

  it('stops before searching when checking a held id is refused for a reason that will not pass by searching', async () => {
    for (const [error, kind] of [
      [new PowerBodySoapError('Service Unavailable', '503', false, true), 'rate-limited'],
      [new Error('DEMO account'), 'sandbox'],
      [new Error('Invalid login'), 'credentials'],
    ] as const) {
      search.mockClear()
      const { supplier } = fakeSupplier({}, { refuse: () => error })
      const r = await resolveCode('P60001', { supplier, index: storedIndex({ P60001: '300' }), now })
      expect(r).toMatchObject({ status: 'refused', refusal: kind, kind: 'sku' })
      expect(search).not.toHaveBeenCalled()
    }
  })

  it('goes on to search when the held id merely failed (a supplier error)', async () => {
    const { supplier } = fakeSupplier({}, { refuse: (ids) => (ids[0] === '300' ? new Error('Product not found') : null) })
    search.mockResolvedValue(outcome({ reason: 'deadline' }))
    const r = await resolveCode('P60001', { supplier, index: storedIndex({ P60001: '300' }), now })
    expect(search).toHaveBeenCalledTimes(1)
    expect(r.status).toBe('not-yet')
  })
})

describe('resolveCode — the complete index as evidence of absence', () => {
  it('says not-on-account when a complete index lacks the SKU, without searching', async () => {
    const { supplier } = fakeSupplier({})
    const r = await resolveCode('P60001', {
      supplier,
      index: storedIndex({ P1: '1' }, { complete: true, updatedAt: new Date(NOW - 2 * DAY).toISOString() }),
      now,
    })
    expect(r).toMatchObject({ status: 'not-on-account', kind: 'sku' })
    expect(r.next).toEqual(['check-code', 'search-anyway', 'paste-id'])
    expect(r.message).toContain('read in full on')
    expect(search).not.toHaveBeenCalled()
  })

  it('suggests refreshing the list when the complete index is over a week old', async () => {
    const { supplier } = fakeSupplier({})
    const r = await resolveCode('P60001', {
      supplier,
      index: storedIndex({ P1: '1' }, { complete: true, updatedAt: new Date(NOW - 9 * DAY).toISOString() }),
      now,
    })
    expect(r.status).toBe('not-on-account')
    expect(r.next).toEqual(['check-code', 'refresh-index', 'search-anyway', 'paste-id'])
    expect(r.message).toMatch(/over a week old/)
  })

  it('searches anyway when asked to', async () => {
    const { supplier } = fakeSupplier({})
    search.mockResolvedValue(outcome({ reason: 'not-found', bracket: { lo: 10, hi: 90 } }))
    const r = await resolveCode('P60001', {
      supplier,
      searchAnyway: true,
      index: storedIndex({ P1: '1' }, { complete: true }),
      now,
    })
    expect(search).toHaveBeenCalledTimes(1)
    // Even then, an exhausted bracket is not evidence of absence.
    expect(r.status).toBe('not-yet')
  })

  it('an incomplete index proves nothing: it searches', async () => {
    const { supplier } = fakeSupplier({})
    await resolveCode('P60001', { supplier, index: storedIndex({ P1: '1' }, { complete: false }), now })
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('reads the stored index when none is supplied', async () => {
    readIndex.mockResolvedValue(storedIndex({ P1: '1' }, { complete: true }))
    const { supplier } = fakeSupplier({})
    const r = await resolveCode('P60001', { supplier, now })
    expect(readIndex).toHaveBeenCalled()
    expect(r.status).toBe('not-on-account')
  })
})

describe('resolveCode — the id search', () => {
  it.each(['deadline', 'probe-budget', 'not-found'] as const)(
    'reports %s as not-yet — never as not-on-account',
    async (reason) => {
      const { supplier } = fakeSupplier({})
      search.mockResolvedValue(outcome({ reason, probes: 40, bracket: { lo: 1000, hi: 9000 } }))
      const r = await resolveCode('P60001', { supplier, index: storedIndex({}), now })
      expect(r).toMatchObject({ status: 'not-yet', kind: 'sku', probes: 40 })
      expect(r.next).toEqual(['search-again', 'paste-id'])
      expect(r.message).not.toMatch(/not on this account/)
    },
  )

  it('finds a SKU through the search, checks it, and remembers it and every product it saw', async () => {
    const { supplier, asked } = fakeSupplier({ '7001': 'P59990', '7005': 'P60010', '7003': 'P60001' })
    search.mockImplementation(async (_sku, wrapped) => {
      // The search probes through the supplier it is handed.
      await wrapped.getProductsById(['7001'])
      await wrapped.getProductsById(['7005'])
      return outcome({ productId: 7003, reason: 'found', probes: 3 })
    })
    const r = await resolveCode('P60001', { supplier, index: storedIndex({}), now })

    expect(r).toMatchObject({ status: 'found', via: 'search', productId: '7003', kind: 'sku', probes: 3 })
    // The id the search found is asked about once more and checked.
    expect(asked.at(-1)).toEqual(['7003'])
    const pairs = rememberedPairs()
    expect(pairs).toEqual(
      expect.arrayContaining([
        { sku: 'P59990', productId: '7001' },
        { sku: 'P60010', productId: '7005' },
        { sku: 'P60001', productId: '7003' },
      ]),
    )
  })

  it('remembers what a search saw even when it did not find the SKU', async () => {
    const { supplier } = fakeSupplier({ '7001': 'P59990' })
    search.mockImplementation(async (_sku, wrapped) => {
      await wrapped.getProductsById(['7001'])
      return outcome({ reason: 'deadline', probes: 1 })
    })
    await resolveCode('P60001', { supplier, index: storedIndex({}), now })
    expect(rememberedPairs()).toEqual([{ sku: 'P59990', productId: '7001' }])
  })

  it('refuses an id the search found when PowerBody then answer for another product', async () => {
    const { supplier } = fakeSupplier({ '7003': 'P11111' })
    search.mockResolvedValue(outcome({ productId: 7003, reason: 'found' }))
    const r = await resolveCode('P60001', { supplier, index: storedIndex({}), now })
    expect(r).toMatchObject({ status: 'refused', refusal: 'supplier-error' })
    expect(r.product).toBeUndefined()
  })

  it('a SKU with no number in it is unusable', async () => {
    const { supplier } = fakeSupplier({})
    search.mockResolvedValue(outcome({ reason: 'unusable-sku' }))
    const r = await resolveCode('SHAKER-BLACK', { supplier, index: storedIndex({}), now })
    expect(r).toMatchObject({ status: 'unusable', next: ['paste-id', 'check-code'] })
  })

  it('a blank code is unusable without asking anyone', async () => {
    const { supplier, asked } = fakeSupplier({})
    const r = await resolveCode('   ', { supplier, index: storedIndex({}), now })
    expect(r.status).toBe('unusable')
    expect(asked).toEqual([])
    expect(search).not.toHaveBeenCalled()
  })

  it('reports the feed’s own words when it could not be read for anchors', async () => {
    const { supplier } = fakeSupplier({})
    search.mockResolvedValue(outcome({ reason: 'no-anchors', feedError: 'Invalid login' }))
    const r = await resolveCode('P60001', { supplier, index: storedIndex({}), now })
    expect(r).toMatchObject({ status: 'refused', refusal: 'credentials' })
    expect(r.message).toContain('Invalid login')
  })

  it.each([
    [new PowerBodySoapError('Service Unavailable', '503', false, true), 'rate-limited'],
    [new Error('429 Too Many Requests'), 'rate-limited'],
    [new Error('Your account is a DEMO account'), 'sandbox'],
    [new Error('Access denied for user'), 'credentials'],
    [new Error('Unexpected reply'), 'supplier-error'],
  ] as const)('a search that throws %p is refused as %s', async (error, kind) => {
    const { supplier } = fakeSupplier({})
    search.mockRejectedValue(error)
    const r = await resolveCode('P60001', { supplier, index: storedIndex({}), now })
    expect(r).toMatchObject({ status: 'refused', refusal: kind, kind: 'sku' })
  })

  it('does not start a search it has no time for', async () => {
    const { supplier } = fakeSupplier({})
    const r = await resolveCode('P60001', { supplier, index: storedIndex({}), budgetMs: 3_000, now })
    expect(r).toMatchObject({ status: 'not-yet', next: ['search-again', 'paste-id'] })
    expect(search).not.toHaveBeenCalled()
  })

  it('gives the search what is left of the clock, and pairs from a big index as anchors', async () => {
    const big: Record<string, string> = {}
    for (let n = 0; n < 50; n++) big[`P${40000 + n}`] = String(5000 + n * 3)
    const { supplier } = fakeSupplier({})
    search.mockResolvedValue(outcome({ reason: 'deadline' }))
    await resolveCode('P60001', { supplier, index: storedIndex(big), budgetMs: 30_000, now })

    const [sku, , options] = search.mock.calls[0]
    expect(sku).toBe('P60001')
    expect(options?.budgetMs).toBe(28_000)
    expect(options?.anchors).toHaveLength(50)
    expect(options?.anchors?.[0]).toEqual({ sku: 'P40000', productId: 5000 })
  })

  it('reports every step to the caller as it happens', async () => {
    const steps: string[] = []
    const { supplier } = fakeSupplier({ '300': 'P60001' })
    const r = await resolveCode('P60001', {
      supplier,
      index: storedIndex({ P60001: '300' }),
      onStep: (s) => steps.push(s.phase),
      now,
    })
    expect(steps).toEqual(r.trace.map((s) => s.phase))
    expect(steps.at(-1)).toBe('done')
  })
})

describe('resolveCode — the sample catalogue', () => {
  it('answers from the mock supplier without ids, the index or a search', async () => {
    const hit = pbProduct('CHRGD-WHEY-CHOC', null)
    const { supplier, asked, skuCalls } = fakeSupplier({}, { name: 'mock', bySku: [hit] })
    const r = await resolveCode('chrgd-whey-choc', { supplier, now })

    expect(r).toMatchObject({ status: 'found', via: 'sample', kind: 'sku' })
    expect(r.product).toBe(hit)
    expect(skuCalls).toEqual([['CHRGD-WHEY-CHOC']])
    expect(asked).toEqual([])
    expect(readIndex).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
    expect(remembered).not.toHaveBeenCalled()
  })

  it('says a miss is the sample catalogue’s, and how to switch to live', async () => {
    const { supplier } = fakeSupplier({}, { name: 'mock' })
    const r = await resolveCode('P60001', { supplier, now })
    expect(r).toMatchObject({ status: 'not-on-account', next: ['open-settings', 'check-code'] })
    expect(r.message).toMatch(/sample catalogue/)
    expect(search).not.toHaveBeenCalled()
  })
})

// ── quickResolve ─────────────────────────────────────────────────────────────

describe('quickResolve', () => {
  it('answers held ids and codes that are ids in batches of twenty, each checked', async () => {
    const catalogue: Record<string, string> = {}
    const bySku: Record<string, string> = {}
    const codes: string[] = []
    for (let n = 0; n < 25; n++) {
      const sku = `P${60000 + n}`
      catalogue[String(9000 + n)] = sku
      bySku[sku] = String(9000 + n)
      codes.push(sku)
    }
    const { supplier, asked } = fakeSupplier(catalogue)
    const { results, refusal } = await quickResolve(codes, { supplier, index: storedIndex(bySku) })

    expect(refusal).toBeNull()
    expect(asked.map((batch) => batch.length)).toEqual([20, 5])
    expect(results.every((r) => r.status === 'found' && r.via === 'index' && r.kind === 'sku')).toBe(true)
    expect(results[3]).toMatchObject({ code: 'P60003', productId: '9003' })
  })

  it('never takes a held id that now answers for another SKU', async () => {
    const { supplier } = fakeSupplier({ '9000': 'P11111' })
    const { results } = await quickResolve(['P60000'], { supplier, index: storedIndex({ P60000: '9000' }) })
    expect(results[0]).toMatchObject({ code: 'P60000', status: 'unresolved' })
    expect(results[0].product).toBeUndefined()
  })

  it('marks a SKU missing from a complete index not-on-account, and leaves the rest unresolved', async () => {
    const { supplier } = fakeSupplier({})
    const complete = await quickResolve(['P60000', 'P60001'], {
      supplier,
      index: storedIndex({ P60001: '9001' }, { complete: true }),
    })
    expect(complete.results.map((r) => [r.code, r.status])).toEqual([
      ['P60000', 'not-on-account'],
      // In the index but its id did not answer — needs a search, not a verdict.
      ['P60001', 'unresolved'],
    ])

    const partial = await quickResolve(['P60000'], { supplier, index: storedIndex({}, { complete: false }) })
    expect(partial.results[0]).toMatchObject({ status: 'unresolved', message: expect.stringMatching(/search/) })
  })

  it('treats an all-digit code as an id, and as SKU P+code when it is not one', async () => {
    const { supplier } = fakeSupplier({ '44338': 'P51200', '9001': 'P55555' })
    const { results } = await quickResolve(['44338', '55555', '12345'], {
      supplier,
      index: storedIndex({ P55555: '9001' }, { complete: true }),
    })
    expect(results[0]).toMatchObject({ code: '44338', kind: 'id', via: 'id', status: 'found', productId: '44338' })
    expect(results[0].message).toContain('SKU P51200')
    expect(results[1]).toMatchObject({ code: '55555', kind: 'sku', via: 'index', status: 'found', productId: '9001' })
    // An id-shaped code is never ruled out by the index: it may be an id.
    expect(results[2]).toMatchObject({ code: '12345', kind: 'id', status: 'unresolved' })
  })

  it('asks about each distinct code once, normalised', async () => {
    const { supplier } = fakeSupplier({ '9000': 'P60000' })
    const { results } = await quickResolve([' p60000', 'P60000', ''], { supplier, index: storedIndex({ P60000: '9000' }) })
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ code: 'P60000', status: 'found' })
  })

  it('uses saved and mapped ids too', async () => {
    mapped.mockImplementation((sku) => (sku === 'P60002' ? 9002 : null))
    const { supplier } = fakeSupplier({ '9001': 'P60001', '9002': 'P60002' })
    const { results } = await quickResolve(['P60001', 'P60002'], {
      supplier,
      savedIdFor: (sku) => (sku === 'P60001' ? '9001' : null),
      index: storedIndex({}),
    })
    expect(results.map((r) => r.via)).toEqual(['saved', 'map'])
  })

  it('reports a refusal and stops asking', async () => {
    const codes = Array.from({ length: 25 }, (_, n) => `P${60000 + n}`)
    const bySku = Object.fromEntries(codes.map((c, n) => [c, String(9000 + n)]))
    const { supplier, asked } = fakeSupplier({}, { refuse: () => new Error('HTTP 429 Too Many Requests') })
    const { results, refusal } = await quickResolve(codes, { supplier, index: storedIndex(bySku) })

    expect(refusal?.kind).toBe('rate-limited')
    expect(asked).toHaveLength(1)
    expect(results.every((r) => r.status === 'unresolved')).toBe(true)
  })

  it('carries on past a batch that merely failed', async () => {
    const codes = Array.from({ length: 25 }, (_, n) => `P${60000 + n}`)
    const bySku = Object.fromEntries(codes.map((c, n) => [c, String(9000 + n)]))
    const catalogue = Object.fromEntries(codes.map((c, n) => [String(9000 + n), c]))
    const { supplier, asked } = fakeSupplier(catalogue, {
      refuse: (ids) => (ids.includes('9000') ? new Error('Product not found') : null),
    })
    const { results, refusal } = await quickResolve(codes, { supplier, index: storedIndex(bySku) })

    expect(refusal).toBeNull()
    expect(asked).toHaveLength(2)
    expect(results.filter((r) => r.status === 'found')).toHaveLength(5)
  })

  it('answers from the sample catalogue when the supplier is the mock', async () => {
    const hit = pbProduct('CHRGD-WHEY-CHOC', null)
    const { supplier, asked } = fakeSupplier({}, { name: 'mock', bySku: [hit] })
    const { results, refusal } = await quickResolve(['chrgd-whey-choc', 'P60001'], { supplier })
    expect(refusal).toBeNull()
    expect(results.map((r) => [r.code, r.status, r.via])).toEqual([
      ['CHRGD-WHEY-CHOC', 'found', 'sample'],
      ['P60001', 'not-on-account', undefined],
    ])
    expect(asked).toEqual([])
    expect(readIndex).not.toHaveBeenCalled()
  })
})
