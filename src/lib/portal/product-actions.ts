import type { CatalogueProduct, FieldSource } from '@/lib/catalogue/types'
import { canMerge, mergeInto } from '@/lib/catalogue/merge'
import { isBlankValue, withoutSupplierOwned } from '@/lib/catalogue/review'
import { autopopulateProduct } from '@/lib/supplier/autopopulate'
import { editStoredProduct, markProductRemoved, restructureProducts, ProductNotFound } from './store'
import { getEditableProduct } from './product-edit'

/**
 * What can happen to a product as a whole: remove, restore, discard, merge, and
 * "fill the blanks". Each refuses with a sentence a founder can act on.
 */

/** A refusal with the reason in plain words, and where to go about it. */
export class ActionRefused extends Error {
  constructor(
    message: string,
    readonly link?: { label: string; href: string },
  ) {
    super(message)
    this.name = 'ActionRefused'
  }
}

const productHref = (id: string) => `/founderhub/products/item/${encodeURIComponent(id)}`

/** Take a product off sale. Soft: Restore brings it back as it was. */
export async function removeProduct(id: string): Promise<void> {
  const entry = await getEditableProduct(id)
  if (!entry) throw new ProductNotFound(id)
  if (entry.state === 'removed') return
  await markProductRemoved(id)
}

/**
 * Put a removed product back on sale — unless its SKUs have since gone onto
 * another product (a merge, or a re-add), in which case restoring it would put
 * the same tub on the shelf twice. The refusal names the product that has them.
 */
export async function restoreRemovedProduct(id: string): Promise<void> {
  await restructureProducts((bench) => {
    const product = bench.get(id)
    if (!product) throw new ProductNotFound(id)
    if (!bench.isRemoved(id)) return
    const skus = product.variants.map((v) => v.sku).filter((s): s is string => Boolean(s))
    const holder = bench.holderOf(skus, id)
    if (holder && holder.state !== 'removed') {
      throw new ActionRefused(
        `Its SKUs are now sold as “${holder.product.title}”, so restoring this would list them twice.`,
        { label: `Open ${holder.product.title}`, href: productHref(holder.product.id) },
      )
    }
    bench.restore(id)
  })
}

/**
 * Delete a product that never went on sale, leaving no trace — so adding the
 * same SKU again later starts fresh instead of finding a removed copy.
 */
export async function discardProduct(id: string): Promise<void> {
  await restructureProducts((bench) => {
    const product = bench.get(id)
    if (!product) throw new ProductNotFound(id)
    if (product.review?.status !== 'pending') {
      throw new ActionRefused('Only a product still waiting for review can be discarded. Remove it instead — that can be undone.')
    }
    bench.discard(id)
  })
}

/**
 * Move other products' SKUs onto `targetId` as more flavours.
 *
 * The target keeps everything a customer and the quiz know it by. Each source
 * is discarded if it never went on sale, or removed (restorable) if it did, and
 * takes its place on the Top 25 with it to the target. Pre-built bundles that
 * sold a source keep pointing at it — the caller shows `productUsage` first.
 */
export async function mergeIntoProduct(
  targetId: string,
  sourceIds: string[],
): Promise<{ product: CatalogueProduct; moved: number; removed: string[]; discarded: string[] }> {
  const ids = [...new Set(sourceIds)].filter((s) => s !== targetId)
  if (ids.length === 0) throw new ActionRefused('Pick another product to bring in.')
  return restructureProducts((bench) => {
    const target = bench.get(targetId)
    if (!target) throw new ProductNotFound(targetId)
    if (bench.isRemoved(targetId)) throw new ActionRefused('Restore this product before adding flavours to it.')
    const sources = ids.map((id) => {
      const p = bench.get(id)
      if (!p) throw new ProductNotFound(id)
      return p
    })
    const check = canMerge([target, ...sources])
    if (!check.ok) throw new ActionRefused(check.reason)

    const merged = mergeInto(target, sources)
    bench.put(merged)
    const removed: string[] = []
    const discarded: string[] = []
    for (const source of sources) {
      bench.repointRoster(source.id, targetId)
      if (source.review?.status === 'pending') {
        bench.discard(source.id)
        discarded.push(source.id)
      } else {
        bench.remove(source.id)
        removed.push(source.id)
      }
    }
    return { product: merged, moved: merged.variants.length - target.variants.length, removed, discarded }
  })
}

/**
 * Fill a product's BLANK fields from the classifier, and nothing else.
 *
 * "Blank" is the contract: a field somebody filled — from the spreadsheet,
 * from PowerBody, by hand — is a decision, and a model overwriting a decision is
 * the worst thing this could do. Supplier-owned fields, the price, the cost and
 * the serving count are never touched: a model guessing a number would put it
 * straight into the margin model.
 *
 * What it fills is recorded as written by the model and left UNCONFIRMED, so a
 * product waiting for review still needs a person to tick each one. (Filling
 * the form and pressing Save would instead have signed every guess off as the
 * founder's.)
 */
export async function fillBlanks(id: string): Promise<{ filled: string[]; source: FieldSource }> {
  const entry = await getEditableProduct(id)
  if (!entry) throw new ProductNotFound(id)
  const { patch, source } = await autopopulateProduct(entry.product)
  const candidate = withoutSupplierOwned(patch) as Record<string, unknown>
  delete candidate.cost
  delete candidate.servings
  delete candidate.consumption

  let filled: string[] = []
  const written: FieldSource = source === 'ai' ? 'ai' : 'heuristic'
  await editStoredProduct(id, (current) => {
    const take: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(candidate)) {
      if (!isBlankValue(key, (current as unknown as Record<string, unknown>)[key])) continue
      if (value === null || value === undefined) continue
      if (typeof value === 'string' && !value.trim()) continue
      if (Array.isArray(value) && value.length === 0) continue
      take[key] = value
    }
    filled = Object.keys(take)
    if (filled.length === 0) return null
    const review = current.review
    return {
      ...current,
      ...take,
      ...(review
        ? {
            review: {
              ...review,
              sources: { ...review.sources, ...Object.fromEntries(filled.map((k) => [k, written])) },
              confirmed: review.confirmed.filter((k) => !filled.includes(k)),
            },
          }
        : {}),
    } as CatalogueProduct
  })
  return { filled, source: written }
}
