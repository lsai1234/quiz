/**
 * The operation the hub panel and the backfill script both run.
 *
 * The store is mocked so these test the cleanup's own rules — what counts as a
 * candidate, what gets written, what is left alone — rather than persistence.
 */
const store: { imported: import('../types').CatalogueProduct[] } = { imported: [] }
const addImportedProducts = jest.fn(async (products: import('../types').CatalogueProduct[]) => {
  const byId = new Map(store.imported.map((p) => [p.id, p]))
  for (const p of products) byId.set(p.id, p)
  store.imported = [...byId.values()]
})

jest.mock('@/lib/portal/store', () => ({
  getImportedProducts: async () => store.imported,
  addImportedProducts: (products: import('../types').CatalogueProduct[]) => addImportedProducts(products),
}))

const rewriteDescription = jest.fn()
jest.mock('../rewrite-description', () => ({
  rewriteDescription: (input: unknown) => rewriteDescription(input),
}))

import { cleanupDescriptions, scanDescriptions } from '../description-cleanup'
import { MOCK_CATALOGUE } from '../mock-catalogue'
import type { CatalogueProduct } from '../types'

const DIRTY = '<div class="RichText3-paragraph">OSAVI shaker in blue, 700 ml capacity.</div>'
const CLEANED = 'OSAVI shaker in blue, 700 ml capacity.'

function product(id: string, description: string): CatalogueProduct {
  return { ...MOCK_CATALOGUE[0], id, title: id, description }
}

beforeEach(() => {
  store.imported = []
  addImportedProducts.mockClear()
  rewriteDescription.mockReset()
})

describe('scanDescriptions', () => {
  it('counts what needs doing without touching anything', async () => {
    store.imported = [product('a', DIRTY), product('b', 'Already clean.'), product('c', '')]

    const scan = await scanDescriptions()

    expect(scan.total).toBe(3)
    expect(scan.withDescription).toBe(2)
    expect(scan.withMarkup).toBe(1)
    expect(scan.candidates.map((c) => c.id)).toEqual(['a', 'b'])
    expect(scan.candidates.find((c) => c.id === 'a')?.hasMarkup).toBe(true)
    expect(scan.candidates.find((c) => c.id === 'b')?.hasMarkup).toBe(false)
    expect(addImportedProducts).not.toHaveBeenCalled()
  })

  it('does not offer a product with no description as a candidate', async () => {
    store.imported = [product('empty', '   ')]
    const scan = await scanDescriptions()
    expect(scan.withDescription).toBe(0)
    expect(scan.candidates).toEqual([])
  })
})

describe('cleanupDescriptions', () => {
  it('previews without writing when write is false', async () => {
    store.imported = [product('a', DIRTY)]

    const result = await cleanupDescriptions({ ids: ['a'] })

    expect(result.changes).toHaveLength(1)
    expect(result.changes[0].after).toBe(CLEANED)
    expect(result.written).toBe(false)
    expect(addImportedProducts).not.toHaveBeenCalled()
    expect(store.imported[0].description).toBe(DIRTY)
  })

  it('writes the cleaned description when asked', async () => {
    store.imported = [product('a', DIRTY)]

    const result = await cleanupDescriptions({ ids: ['a'], write: true })

    expect(result.written).toBe(true)
    expect(store.imported[0].description).toBe(CLEANED)
  })

  it('only touches the ids it is given', async () => {
    store.imported = [product('a', DIRTY), product('b', DIRTY)]

    await cleanupDescriptions({ ids: ['a'], write: true })

    expect(store.imported.find((p) => p.id === 'a')?.description).toBe(CLEANED)
    expect(store.imported.find((p) => p.id === 'b')?.description).toBe(DIRTY)
  })

  it('processes everything when no ids are given', async () => {
    store.imported = [product('a', DIRTY), product('b', DIRTY)]
    const result = await cleanupDescriptions({ write: true })
    expect(result.changes).toHaveLength(2)
  })

  it('reports an already-clean product as unchanged and writes nothing', async () => {
    store.imported = [product('a', 'Already clean.')]

    const result = await cleanupDescriptions({ ids: ['a'], write: true })

    expect(result.changes).toHaveLength(0)
    expect(result.unchanged).toBe(1)
    expect(result.written).toBe(false)
    expect(addImportedProducts).not.toHaveBeenCalled()
  })

  it('is a no-op the second time — safe to re-run', async () => {
    store.imported = [product('a', DIRTY)]

    await cleanupDescriptions({ ids: ['a'], write: true })
    const second = await cleanupDescriptions({ ids: ['a'], write: true })

    expect(second.changes).toHaveLength(0)
    expect(second.unchanged).toBe(1)
  })

  it('never calls the rewrite unless AI was asked for', async () => {
    store.imported = [product('a', DIRTY)]
    await cleanupDescriptions({ ids: ['a'], write: true })
    expect(rewriteDescription).not.toHaveBeenCalled()
  })

  it('writes the rewrite and counts it when AI is used', async () => {
    store.imported = [product('a', DIRTY)]
    rewriteDescription.mockResolvedValueOnce({ text: 'A 700 ml blue shaker.', source: 'ai' })

    const result = await cleanupDescriptions({ ids: ['a'], ai: true, write: true })

    expect(result.aiUsed).toBe(1)
    expect(result.fellBack).toBe(0)
    expect(store.imported[0].description).toBe('A 700 ml blue shaker.')
  })

  it('carries the rejection reason through when the rewrite is refused', async () => {
    store.imported = [product('a', DIRTY)]
    rewriteDescription.mockResolvedValueOnce({
      text: CLEANED,
      source: 'cleaned',
      reason: 'claim-flagged',
      flags: [{ match: 'proven', why: 'implies a proven/guaranteed effect' }],
    })

    const result = await cleanupDescriptions({ ids: ['a'], ai: true, write: true })

    expect(result.aiUsed).toBe(0)
    expect(result.fellBack).toBe(1)
    expect(result.changes[0]).toMatchObject({ source: 'cleaned', reason: 'claim-flagged' })
    expect(result.changes[0].flags?.[0].match).toBe('proven')
    // The claim never reaches the catalogue — the cleaned source is stored.
    expect(store.imported[0].description).toBe(CLEANED)
  })

  it('ignores an id that is not in the catalogue', async () => {
    store.imported = [product('a', DIRTY)]
    const result = await cleanupDescriptions({ ids: ['a', 'ghost'], write: true })
    expect(result.scanned).toBe(1)
    expect(result.changes).toHaveLength(1)
  })
})
