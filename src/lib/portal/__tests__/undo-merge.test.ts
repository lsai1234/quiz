/**
 * @jest-environment node
 */
import { kvSet } from '@/lib/db/kv'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { CatalogueProduct, ProductReview } from '@/lib/catalogue/types'
import { variantForLine } from '@/lib/catalogue/line-variant'
import { clearPersistCache } from '../persist'
import { getPersistedProducts, editStoredProduct } from '../store'
import { ActionRefused, mergeIntoProduct, restoreRemovedProduct, undoMerge } from '../product-actions'

jest.mock('@/lib/supplier/autopopulate', () => ({ autopopulateProduct: jest.fn() }))

/**
 * Undo merge: the way back from merging the wrong product in.
 *
 * A merged product can't be restored on its own — the product it went into
 * sells its SKUs, so a restore would list each tub twice and is refused. Undo
 * takes the SKUs that came from it back off the target and puts it back on sale
 * exactly as it was.
 */

const KEY = 'portal:products'
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const APPROVED: ProductReview = {
  status: 'approved',
  sources: { title: 'supplier' },
  confirmed: ['title'],
  importedAt: '2026-09-01T10:00:00.000Z',
  approvedAt: '2026-09-02T09:30:00.000Z',
}

function pb(id: string, skus: string[], over: Partial<CatalogueProduct> = {}): CatalogueProduct {
  const base = clone(MOCK_CATALOGUE[0])
  const flavours = base.variants.filter((v) => v.size === '1kg')
  return {
    ...base,
    id,
    handle: id,
    title: `Applied Whey ${id}`,
    defaultVariantId: `${id}-v1`,
    variants: skus.map((sku, i) => ({ ...flavours[i % flavours.length], id: `${id}-v${i + 1}`, sku, servings: 33 })),
    review: APPROVED,
    ...over,
  }
}

async function seed(imported: CatalogueProduct[], removedIds: string[] = []): Promise<void> {
  await kvSet(KEY, { overrides: {}, removedIds, imported, topProductIds: [] })
  clearPersistCache()
}

async function fresh() {
  clearPersistCache()
  return getPersistedProducts()
}

const skusOf = (p: CatalogueProduct | undefined) => (p?.variants ?? []).map((v) => v.sku)

describe('undoing a merge', () => {
  it('takes the merged SKUs back off the target and puts the product back on sale as it was', async () => {
    const target = pb('choc', ['P-1', 'P-2'])
    const source = pb('straw', ['P-3'], { description: 'Strawberry’s own words.' })
    await seed([target, source])
    await mergeIntoProduct('choc', ['straw'])
    let state = await fresh()
    expect(skusOf(state.imported.find((p) => p.id === 'choc'))).toEqual(['P-1', 'P-2', 'P-3'])
    expect(state.removedIds).toContain('straw')

    // A restore would list P-3 twice, and says to undo instead.
    await expect(restoreRemovedProduct('straw')).rejects.toThrow(/undo the merge/)

    const result = await undoMerge('straw')
    expect(result.moved).toBe(1)
    state = await fresh()
    expect(skusOf(state.imported.find((p) => p.id === 'choc'))).toEqual(['P-1', 'P-2'])
    expect(state.removedIds).not.toContain('straw')
    const back = state.imported.find((p) => p.id === 'straw')!
    expect(back.description).toBe('Strawberry’s own words.')
    expect(skusOf(back)).toEqual(['P-3'])
  })

  it('lets a line written against the target since the merge find the SKU where it went back to', async () => {
    await seed([pb('choc', ['P-1']), pb('straw', ['P-3'])])
    await mergeIntoProduct('choc', ['straw'])
    const moved = (await fresh()).imported.find((p) => p.id === 'choc')!.variants.find((v) => v.sku === 'P-3')!
    const line = { productId: 'choc', variantTitle: [moved.flavour, moved.size].filter(Boolean).join(' · ') || moved.title }

    await undoMerge('straw')
    const catalogue = (await fresh()).imported
    expect(variantForLine(line, catalogue)?.variant.sku).toBe('P-3')
  })

  it('refuses, saying what to do, when the merge discarded the product (it never went on sale)', async () => {
    await seed([pb('choc', ['P-1']), pb('straw', ['P-3'], { review: { status: 'pending', sources: {}, confirmed: [], importedAt: '2026-10-10' } })])
    const merge = await mergeIntoProduct('choc', ['straw'])
    expect(merge.discarded).toEqual(['straw'])
    await expect(undoMerge('straw')).rejects.toThrow(/move them into their own product/)
  })

  it('refuses while the target uses one of the merged SKUs as its master, and changes nothing', async () => {
    await seed([pb('choc', ['P-1']), pb('straw', ['P-3'])])
    await mergeIntoProduct('choc', ['straw'])
    const movedId = (await fresh()).imported.find((p) => p.id === 'choc')!.variants.find((v) => v.sku === 'P-3')!.id
    await editStoredProduct('choc', (p) => ({ ...p, defaultVariantId: movedId }))

    const error = await undoMerge('straw').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ActionRefused)
    expect((error as Error).message).toMatch(/master/)
    const state = await fresh()
    expect(skusOf(state.imported.find((p) => p.id === 'choc'))).toEqual(['P-1', 'P-3'])
    expect(state.removedIds).toContain('straw')
  })

  it('will not undo SKUs that were added to another product rather than merged from this one', async () => {
    await seed([pb('choc', ['P-1', 'P-3']), pb('straw', ['P-3'])], ['straw'])
    await expect(undoMerge('straw')).rejects.toThrow(/no merge to undo/)
  })

  it('will not merge a product that was merged away once already into a second one', async () => {
    await seed([pb('choc', ['P-1']), pb('straw', ['P-3']), pb('van', ['P-5'])])
    await mergeIntoProduct('choc', ['straw'])
    await expect(mergeIntoProduct('van', ['straw'])).rejects.toThrow(/sold as “Applied Whey choc” now/)
    const van = (await fresh()).imported.find((p) => p.id === 'van')!
    expect(skusOf(van)).toEqual(['P-5'])
  })

  it('refuses a product that is not removed', async () => {
    await seed([pb('choc', ['P-1']), pb('straw', ['P-3'])])
    await expect(undoMerge('straw')).rejects.toThrow(/not merged into anything/)
  })
})
