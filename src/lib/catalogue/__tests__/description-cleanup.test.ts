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
  // The real one hands the change the products as stored at write time and
  // writes back the ones it returns — modelled the same way here.
  updateImportedProducts: async (
    change: (current: import('../types').CatalogueProduct[]) => { products: import('../types').CatalogueProduct[]; result: unknown },
  ) => {
    const { products, result } = change(store.imported.map((p) => ({ ...p })))
    if (products.length > 0) await addImportedProducts(products)
    return result
  },
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

/** With an import's review record: the description is PowerBody's. */
function reviewed(p: CatalogueProduct, status: 'pending' | 'approved' = 'approved'): CatalogueProduct {
  return {
    ...p,
    review: { status, sources: { description: 'supplier', title: 'supplier' }, confirmed: ['description'], importedAt: '2026-10-01T09:00:00.000Z' },
  }
}

/** …and one whose description the founder wrote on the product page. */
function founders(p: CatalogueProduct): CatalogueProduct {
  const r = reviewed(p)
  return { ...r, review: { ...r.review!, sources: { ...r.review!.sources, description: 'founder' } } }
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

  it('says which descriptions the founder wrote, so the rewrite can leave them out', async () => {
    store.imported = [product('a', 'PowerBody copy.'), founders(product('b', 'Our own words.'))]
    const scan = await scanDescriptions()
    expect(scan.candidates.map((c) => [c.id, c.founderWritten])).toEqual([['a', false], ['b', true]])
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

  describe('the founder’s own words', () => {
    it('the AI rewrite leaves a description the founder wrote alone, and says so', async () => {
      store.imported = [founders(product('mine', 'Our own words about this whey.')), reviewed(product('theirs', 'PowerBody copy.'))]
      rewriteDescription.mockResolvedValue({ text: 'A rewrite.', source: 'ai' })

      const result = await cleanupDescriptions({ ids: ['mine', 'theirs'], ai: true, write: true })

      expect(store.imported.find((p) => p.id === 'mine')?.description).toBe('Our own words about this whey.')
      expect(store.imported.find((p) => p.id === 'theirs')?.description).toBe('A rewrite.')
      expect(result.founderWritten).toBe(1)
      expect(result.changes.map((c) => c.id)).toEqual(['theirs'])
      // Not even asked: the model is never sent the founder's text.
      expect(rewriteDescription).toHaveBeenCalledTimes(1)
    })

    it('the markup strip still cleans it — it keeps every word, and they stay the founder’s', async () => {
      store.imported = [founders(product('mine', DIRTY))]
      const result = await cleanupDescriptions({ ids: ['mine'], write: true })
      expect(store.imported[0].description).toBe(CLEANED)
      expect(store.imported[0].review?.sources.description).toBe('founder')
      expect(result.founderWritten).toBe(0)
    })

    it('…but does not reflow the founder’s paragraphs when there is no markup to strip', async () => {
      const typed = 'First paragraph.\n\nSecond paragraph,   spaced as typed.'
      store.imported = [founders(product('mine', typed))]
      const result = await cleanupDescriptions({ ids: ['mine'], write: true })
      expect(store.imported[0].description).toBe(typed)
      expect(result).toMatchObject({ changes: [], founderWritten: 1, written: false })
    })
  })

  describe('where the description came from, after', () => {
    it('a kept rewrite is the model’s, so a pull does not put the supplier’s copy back', async () => {
      store.imported = [reviewed(product('a', DIRTY))]
      rewriteDescription.mockResolvedValueOnce({ text: 'A 700 ml blue shaker.', source: 'ai' })
      await cleanupDescriptions({ ids: ['a'], ai: true, write: true })
      expect(store.imported[0].review?.sources.description).toBe('ai')
      // On sale already: approving confirmed everything, and that stands.
      expect(store.imported[0].review?.confirmed).toEqual(['description'])
    })

    it('a rewrite on a product still waiting for review has to be checked again', async () => {
      store.imported = [reviewed(product('a', DIRTY), 'pending')]
      rewriteDescription.mockResolvedValueOnce({ text: 'A 700 ml blue shaker.', source: 'ai' })
      await cleanupDescriptions({ ids: ['a'], ai: true, write: true })
      expect(store.imported[0].review?.sources.description).toBe('ai')
      expect(store.imported[0].review?.confirmed).toEqual([])
    })

    it('the plain clean keeps the source — PowerBody’s words, cleaned as the import cleans them', async () => {
      store.imported = [reviewed(product('a', DIRTY))]
      await cleanupDescriptions({ ids: ['a'], write: true })
      expect(store.imported[0].description).toBe(CLEANED)
      expect(store.imported[0].review?.sources.description).toBe('supplier')
    })
  })

  describe('a description changed while the batch was working', () => {
    it('is not overwritten with a rewrite of the old text', async () => {
      store.imported = [reviewed(product('a', DIRTY))]
      rewriteDescription.mockImplementationOnce(async () => {
        // The founder saves a new description in Shop listing meanwhile.
        store.imported = store.imported.map((p) => ({
          ...p,
          description: 'Founder wrote this just now.',
          review: { ...p.review!, sources: { ...p.review!.sources, description: 'founder' as const } },
        }))
        return { text: 'AI rewrite of the old text.', source: 'ai' }
      })

      const result = await cleanupDescriptions({ ids: ['a'], ai: true, write: true })

      expect(store.imported[0].description).toBe('Founder wrote this just now.')
      expect(store.imported[0].review?.sources.description).toBe('founder')
      // Reported as it happened: nothing rewritten, one left because it moved.
      expect(result).toMatchObject({ changes: [], aiUsed: 0, editedMeanwhile: 1, written: false })
    })

    it('still saves the rest of the batch', async () => {
      store.imported = [product('a', DIRTY), product('b', DIRTY)]
      rewriteDescription.mockImplementationOnce(async () => {
        store.imported = store.imported.map((p) => (p.id === 'a' ? { ...p, description: 'Changed meanwhile.' } : p))
        return { text: 'Rewrite of a.', source: 'ai' }
      })
      rewriteDescription.mockResolvedValueOnce({ text: 'Rewrite of b.', source: 'ai' })

      const result = await cleanupDescriptions({ ids: ['a', 'b'], ai: true, write: true })

      expect(store.imported.map((p) => p.description)).toEqual(['Changed meanwhile.', 'Rewrite of b.'])
      expect(result).toMatchObject({ aiUsed: 1, editedMeanwhile: 1, written: true })
      expect(result.changes.map((c) => c.id)).toEqual(['b'])
    })
  })
})
