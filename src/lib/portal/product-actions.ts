import type { CatalogueProduct, FieldSource } from '@/lib/catalogue/types'
import { canMerge, mergeInto } from '@/lib/catalogue/merge'
import { rememberWhere } from '@/lib/catalogue/line-variant'
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
      const merged = holder.product.variants.some((v) => v.formerly?.some((f) => f.productId === id))
      throw new ActionRefused(
        merged
          ? `It was merged into “${holder.product.title}”, which sells its SKUs now — undo the merge to bring it back.`
          : `Its SKUs are now sold as “${holder.product.title}”, so restoring this would list them twice.`,
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
 *
 * A target still waiting for review takes only sources that are waiting too:
 * one on sale would come off the shop with it (see the refusal below).
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
    /*
      Never into a product still waiting for review from one on sale.

      A product waiting for review is sold nowhere — the shop, the quiz and the
      renewal orders all read only products on sale. Merging an on-sale product
      into one would take its SKUs off the shelf with it: the source is removed,
      its Top 25 place moves to a product that cannot fill it, and every member
      subscribed to it renews with no SKU until somebody approves the new one.
      Merging the other way round gets the founder what they meant — the new
      flavour joins the product customers already buy, and the half that never
      went on sale is the one that goes — so the refusal says that, and links
      to the product to do it from.
    */
    if (target.review?.status === 'pending') {
      const live = sources.find((s) => s.review?.status !== 'pending' && !bench.isRemoved(s.id))
      if (live) {
        throw new ActionRefused(
          `“${live.title}” is on sale and this product is still waiting for review, so merging it in here would take “${live.title}” off the shop until this one is approved. Merge the other way: open “${live.title}” and bring this one into it.`,
          { label: `Open ${live.title}`, href: productHref(live.id) },
        )
      }
    }
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
 * Undo a merge: give a removed product back the SKUs it brought to another one,
 * and put it back on sale.
 *
 * A merged product can't simply be restored — the product it went into holds
 * its SKUs, and restoring it would list each tub twice. So the SKUs that came
 * from it (they remember where they came from, in `formerly`) leave the target,
 * and the removed product comes back with its own record, exactly as it was
 * before the merge. Anything changed on those SKUs while they were on the
 * target stays with the target's copy and goes. Lines written against the
 * target since the merge follow the SKU back, by the note left here.
 *
 * A product that was discarded by the merge (it never went on sale) has no
 * record to come back to; the refusal says what to do instead.
 */
export async function undoMerge(sourceId: string): Promise<{ restored: CatalogueProduct; target: CatalogueProduct; moved: number }> {
  return restructureProducts((bench) => {
    const source = bench.get(sourceId)
    if (!source) {
      throw new ActionRefused(
        'That product was discarded when it was merged — it had never gone on sale — so there is no record to bring back. To separate its flavours again, tick them under Flavours & sizes and move them into their own product.',
      )
    }
    if (!bench.isRemoved(sourceId)) throw new ActionRefused(`“${source.title}” is not merged into anything — it is still listed on its own.`)
    const skus = source.variants.map((v) => v.sku).filter((s): s is string => Boolean(s))
    const holder = bench.holderOf(skus, sourceId)
    if (!holder || holder.state === 'removed') {
      throw new ActionRefused('No product on sale holds its SKUs any more, so there is nothing to undo — Restore puts it back as it was.')
    }
    const target = holder.product
    const theirs = new Set(skus)
    const leaving = target.variants.filter((v) => v.sku && theirs.has(v.sku) && v.formerly?.some((f) => f.productId === sourceId))
    if (leaving.length === 0) {
      throw new ActionRefused(
        `Its SKUs are sold as “${target.title}”, but they were added there rather than merged from here, so there is no merge to undo.`,
        { label: `Open ${target.title}`, href: productHref(target.id) },
      )
    }
    if (leaving.length === target.variants.length) {
      throw new ActionRefused(`Every SKU on “${target.title}” came from this product, so undoing would leave it empty. Remove “${target.title}” and restore this one instead.`)
    }
    if (leaving.some((v) => v.id === target.defaultVariantId)) {
      throw new ActionRefused(
        `“${target.title}” uses one of this product’s SKUs as its master. Make one of its own SKUs the master first (Flavours & sizes), then undo.`,
        { label: `Open ${target.title}`, href: productHref(target.id) },
      )
    }
    const leftBehind = new Set(leaving.map((v) => v.id))
    const shrunk = { ...target, variants: target.variants.filter((v) => !leftBehind.has(v.id)) }
    bench.put(shrunk)
    bench.put({
      ...source,
      variants: source.variants.map((v) => {
        const was = leaving.find((l) => l.sku === v.sku)
        return was ? rememberWhere(v, target.id, was) : v
      }),
    })
    // Anything else that came to hold these SKUs meanwhile (a re-add) wins: refuse.
    const other = bench.holderOf(skus, sourceId)
    if (other && other.state !== 'removed') {
      throw new ActionRefused(`Its SKUs are also sold as “${other.product.title}”, so restoring it would list them twice.`, {
        label: `Open ${other.product.title}`,
        href: productHref(other.product.id),
      })
    }
    bench.restore(sourceId)
    return { restored: bench.get(sourceId)!, target: shrunk, moved: leaving.length }
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
