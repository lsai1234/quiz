/**
 * @jest-environment node
 */
const authed = { value: true }
jest.mock('@/lib/portal/guard', () => ({ isPortalAuthed: async () => authed.value, getFounder: async () => null }))

import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { asPendingReview, fieldsNeedingReview, sourcesForImport } from '@/lib/catalogue/review'
import { clearPersistCache, writeJson } from '@/lib/portal/persist'
import { getImportedProducts, importProducts } from '@/lib/portal/store'
import { GET, POST } from '../route'

/**
 * The review queue's route: the queue, combining, discarding — and nothing
 * that writes a product unchecked. Saving and approving go through
 * `updateProduct` / `approveProduct` on the products route, which check every
 * field; a raw `patch` here skipped all of it.
 */

const EMPTY_PRODUCTS = { overrides: {}, removedIds: [], imported: [], topProductIds: [] }

function pending(id: string, sku: string): CatalogueProduct {
  const { rating: _rating, ...sample } = MOCK_CATALOGUE[0] as CatalogueProduct
  void _rating
  return asPendingReview(
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
}

async function stored(id: string): Promise<CatalogueProduct | undefined> {
  clearPersistCache()
  return (await getImportedProducts()).find((p) => p.id === id)
}

const post = (body: unknown) =>
  POST(new Request('http://x/api/portal/products/review', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(async () => {
  authed.value = true
  await writeJson('products', EMPTY_PRODUCTS)
  clearPersistCache()
})

afterAll(async () => {
  await writeJson('products', EMPTY_PRODUCTS)
})

describe('POST /api/portal/products/review', () => {
  it('refuses a raw patch — nothing goes on sale unchecked', async () => {
    const [{ id }] = await importProducts([pending('pb-whey', 'PB-1')])
    const before = await stored(id)

    const res = await post({
      id,
      action: 'save',
      patch: {
        review: { status: 'approved', sources: {}, confirmed: [] },
        handle: 'chrgd-whey-protein',
        variants: [{ id: `${id}-v`, price: -5, supplierProductId: 'abc' }],
      },
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/out of date.*Reload/)
    // Nothing written: still waiting for review, its price and address as they were.
    expect(await stored(id)).toEqual(before)
  })

  it('refuses approve-with-a-patch the same way, even with every field ticked', async () => {
    const [{ id }] = await importProducts([pending('pb-whey', 'PB-1')])
    const confirm = fieldsNeedingReview((await stored(id))!).map((f) => f.key)
    const res = await post({ id, action: 'approve', patch: { title: 'Anything' }, confirm })
    expect(res.status).toBe(400)
    expect((await stored(id))?.review?.status).toBe('pending')
    expect((await stored(id))?.title).not.toBe('Anything')
  })

  it('still lists the queue and discards from it', async () => {
    const [{ id }] = await importProducts([pending('pb-whey', 'PB-1')])
    const queue = await (await GET()).json()
    expect(queue.count).toBe(1)

    const res = await post({ action: 'discard', ids: [id] })
    expect(res.status).toBe(200)
    expect(await stored(id)).toBeUndefined()
  })

  it('is founders only', async () => {
    authed.value = false
    expect((await post({ id: 'x', action: 'save', patch: {} })).status).toBe(401)
  })
})
