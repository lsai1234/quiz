/**
 * @jest-environment node
 */
const authed = { value: true }
jest.mock('@/lib/portal/guard', () => ({ isPortalAuthed: async () => authed.value, getFounder: async () => null }))
jest.mock('@/lib/supplier/autopopulate', () => ({ autopopulateProduct: jest.fn() }))
jest.mock('@/lib/portal/product-edit', () => {
  const actual = jest.requireActual('@/lib/portal/product-edit')
  return { ...actual, approveProduct: jest.fn(actual.approveProduct) }
})

import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { asPendingReview, fieldsNeedingReview, sourcesForImport } from '@/lib/catalogue/review'
import { PersistError, clearPersistCache, writeJson } from '@/lib/portal/persist'
import { getImportedProducts, importProducts } from '@/lib/portal/store'
import { approveProduct } from '@/lib/portal/product-edit'
import { autopopulateProduct } from '@/lib/supplier/autopopulate'
import { POST } from '../route'

/**
 * The products route's batch and fill answers: each says exactly what it did.
 * The page reports from these lists and nothing else, so a list that leaves a
 * product out — or a key that is overwritten on the way — is a sentence on the
 * page that is not true.
 */

const EMPTY_PRODUCTS = { overrides: {}, removedIds: [], imported: [], topProductIds: [] }
const approve = approveProduct as jest.MockedFunction<typeof approveProduct>
const autopopulate = autopopulateProduct as jest.MockedFunction<typeof autopopulateProduct>

/** An import waiting for review; `checked` has every field already ticked off. */
function pending(id: string, sku: string, checked = true): CatalogueProduct {
  const { rating: _rating, ...sample } = MOCK_CATALOGUE[0] as CatalogueProduct
  void _rating
  const product = asPendingReview(
    {
      ...sample,
      id,
      handle: id,
      variants: [{ ...sample.variants[0], id: `${id}-v`, sku, price: 34.99 }],
      defaultVariantId: `${id}-v`,
    },
    sourcesForImport(['stackSlots', 'goals'], true),
    '2026-10-01T09:00:00.000Z',
  )
  if (!checked) return product
  return { ...product, review: { ...product.review!, confirmed: fieldsNeedingReview(product).map((f) => f.key as string) } }
}

async function stored(id: string): Promise<CatalogueProduct | undefined> {
  clearPersistCache()
  return (await getImportedProducts()).find((p) => p.id === id)
}

const post = (body: unknown) => POST(new Request('http://x/api/portal/products', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(async () => {
  authed.value = true
  approve.mockClear()
  autopopulate.mockReset()
  await writeJson('products', EMPTY_PRODUCTS)
  clearPersistCache()
})

afterAll(async () => {
  await writeJson('products', EMPTY_PRODUCTS)
})

describe('POST /api/portal/products {action: approve-ready}', () => {
  it('approves the rest when one has gone, and says which one went', async () => {
    const [a, b] = await importProducts([pending('pb-a', 'PB-1'), pending('pb-b', 'PB-2')])

    const res = await post({ action: 'approve-ready', ids: [a.id, 'gone-elsewhere', b.id] })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, approved: [a.id, b.id], notReady: [], gone: ['gone-elsewhere'], failed: null })
    expect((await stored(a.id))?.review?.status).toBe('approved')
    expect((await stored(b.id))?.review?.status).toBe('approved')
  })

  it('reports what was approved before the store failed, the one that failed and the ones never tried', async () => {
    const [a, b, c] = await importProducts([pending('pb-a', 'PB-1'), pending('pb-b', 'PB-2'), pending('pb-c', 'PB-3')])
    approve.mockImplementationOnce(jest.requireActual('@/lib/portal/product-edit').approveProduct)
    approve.mockImplementationOnce(async () => {
      throw new PersistError('the database is not answering.', 'write-failed')
    })

    const res = await post({ action: 'approve-ready', ids: [a.id, b.id, c.id] })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      approved: [a.id],
      notReady: [],
      gone: [],
      failed: { id: b.id, error: 'Not saved — the database is not answering.', notTried: [c.id] },
    })
    expect((await stored(a.id))?.review?.status).toBe('approved')
    expect((await stored(c.id))?.review?.status).toBe('pending')
  })

  it('still fails plainly when nothing at all was done', async () => {
    const [a] = await importProducts([pending('pb-a', 'PB-1')])
    approve.mockImplementationOnce(async () => {
      throw new PersistError('the database is not answering.', 'write-failed')
    })
    const res = await post({ action: 'approve-ready', ids: [a.id] })
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('Not saved — the database is not answering.')
  })

  it('lists the ones with fields still to check', async () => {
    const [a, b] = await importProducts([pending('pb-a', 'PB-1'), pending('pb-b', 'PB-2', false)])
    const body = await (await post({ action: 'approve-ready', ids: [a.id, b.id] })).json()
    expect(body.approved).toEqual([a.id])
    expect(body.notReady).toEqual([{ id: b.id, remaining: expect.arrayContaining(['stackSlots', 'goals']) }])
  })
})

describe('POST /api/portal/products {action: fill-blanks}', () => {
  it('answers with what was filled and how, under its own key — not overwritten by the catalogue’s source', async () => {
    const [p] = await importProducts([{ ...pending('pb-a', 'PB-1', false), shortReason: '' }])
    autopopulate.mockResolvedValue({ patch: { shortReason: 'Protein after training.' }, source: 'heuristic' } as never)

    const body = await (await post({ id: p.id, action: 'fill-blanks' })).json()

    expect(body.fill).toEqual({ filled: ['shortReason'], source: 'heuristic' })
    // The payload's own `source` is still the catalogue's, as the page's badge expects.
    expect(['real', 'mock']).toContain(body.source)
    expect(body.product.shortReason).toBe('Protein after training.')
  })

  it('says when nothing was blank to fill', async () => {
    const [p] = await importProducts([pending('pb-a', 'PB-1', false)])
    autopopulate.mockResolvedValue({ patch: { shortReason: 'Other words.' }, source: 'ai' } as never)
    const body = await (await post({ id: p.id, action: 'fill-blanks' })).json()
    expect(body.fill).toEqual({ filled: [], source: 'ai' })
  })
})
