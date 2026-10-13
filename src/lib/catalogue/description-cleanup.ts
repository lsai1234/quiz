/**
 * The description cleanup, as one operation both callers share.
 *
 * There are two front ends — `scripts/clean-descriptions.ts` and the Founders
 * Hub panel — and exactly one implementation, deliberately. Two copies of "what
 * counts as needing a clean" would drift, and the hub would start disagreeing
 * with the script about how many products are broken.
 *
 * Only IMPORTED products are touched — the mock catalogue is source code — and
 * the AI rewrite never touches a description the founder wrote themselves (see
 * `isFoundersCopy`).
 *
 * ── Why the caller passes ids ──────────────────────────────────────────────
 * `cleanDescription` is a string operation and a whole catalogue of it takes
 * milliseconds. The `--ai` pass is an API call per product, which for a few
 * hundred products is minutes — longer than a request should live. So the hub
 * lists the candidates first and then sends them back in small batches, which
 * keeps every request short, makes progress visible, and means an abandoned run
 * has still banked the products it got through. That only works if the server
 * treats ids as the unit of work rather than re-deciding the set each time.
 */
import { cleanDescription, looksLikeHtml } from './description'
import { rewriteDescription, type RewriteResult } from './rewrite-description'
import { getImportedProducts, updateImportedProducts } from '@/lib/portal/store'
import type { ClaimFlag } from '@/lib/shop/claim-safety'
import type { CatalogueProduct } from './types'

export interface DescriptionCandidate {
  id: string
  title: string
  /** Still carrying raw markup — needs the strip even without the AI pass. */
  hasMarkup: boolean
  /** Written by the founder on the product page — the AI rewrite leaves it alone. */
  founderWritten: boolean
}

export interface DescriptionScan {
  /** Every imported product. */
  total: number
  /** Imported products with a description at all — the AI pass's candidates. */
  withDescription: number
  /** The subset still showing raw markup to customers. */
  withMarkup: number
  candidates: DescriptionCandidate[]
}

export interface DescriptionChange {
  id: string
  title: string
  before: string
  after: string
  /** `ai` when the rewrite was kept, `cleaned` when it was the plain strip. */
  source: 'cleaned' | 'ai'
  /** Why the AI answer was rejected, when it was. */
  reason?: RewriteResult['reason']
  flags?: ClaimFlag[]
}

export interface CleanupResult {
  /** Products actually looked at this batch. */
  scanned: number
  changes: DescriptionChange[]
  /** Looked at, already correct — counted so a no-op run doesn't look broken. */
  unchanged: number
  /** Kept an AI rewrite. */
  aiUsed: number
  /** Asked for AI and fell back to the plain clean. */
  fellBack: number
  /**
   * Left alone because the founder wrote that description: the rewrite never
   * touches one, and the markup strip only one that still carries markup.
   */
  founderWritten: number
  /**
   * Changed on the product page while this batch was working, so this batch's
   * version (worked out from the old text) was not saved over it.
   */
  editedMeanwhile: number
  /** False for a preview — nothing was written. */
  written: boolean
}

/**
 * A description the founder wrote on the product page.
 *
 * "Rewrite with AI" is for the SUPPLIER's copy — that is what the Fix-ups card
 * says it does, and what its candidates are. The founder's own words are not
 * the supplier's, and a catalogue-wide pass with no undo is not how anybody
 * asks for one product's copy to be rewritten: it replaced text they had
 * written by hand with model output, keeping only a 140-character preview of
 * what was there. So the rewrite skips these and says how many it skipped. The
 * markup strip still runs on one that carries markup — it keeps every word.
 */
function isFoundersCopy(product: CatalogueProduct): boolean {
  return product.review?.sources.description === 'founder'
}

/** What needs doing, without doing any of it. Cheap: no API calls. */
export async function scanDescriptions(): Promise<DescriptionScan> {
  const products = await getImportedProducts()
  const described = products.filter((p) => Boolean(p.description?.trim()))

  return {
    total: products.length,
    withDescription: described.length,
    withMarkup: described.filter((p) => looksLikeHtml(p.description)).length,
    candidates: described.map((p) => ({
      id: p.id,
      title: p.title,
      hasMarkup: looksLikeHtml(p.description),
      founderWritten: isFoundersCopy(p),
    })),
  }
}

export interface CleanupOptions {
  /** Which products to process. Omit to process every imported product. */
  ids?: string[]
  /** Also rewrite the copy into our voice. Costs one API call per product. */
  ai?: boolean
  /** Persist the result. False previews the change without writing it. */
  write?: boolean
}

/**
 * Clean (and optionally rewrite) the given products' descriptions.
 *
 * Safe to re-run: `cleanDescription` is idempotent and a product whose
 * description is already what we would write is left untouched, so a second
 * pass over the same ids changes nothing and writes nothing.
 */
export async function cleanupDescriptions(options: CleanupOptions = {}): Promise<CleanupResult> {
  const { ids, ai = false, write = false } = options

  const products = await getImportedProducts()
  const wanted = ids ? new Set(ids) : null
  const batch = products.filter(
    (p) => (wanted ? wanted.has(p.id) : true) && Boolean(p.description?.trim()),
  )

  const changes: DescriptionChange[] = []
  let unchanged = 0
  let aiUsed = 0
  let fellBack = 0
  let founderWritten = 0

  for (const product of batch) {
    // The founder's words: never to the model, and through the plain strip only
    // when they really do carry markup — the strip also tidies line breaks, and
    // reflowing someone's paragraphs is not what "Clean markup" asked for.
    if (isFoundersCopy(product) && (ai || !looksLikeHtml(product.description))) {
      founderWritten += 1
      continue
    }
    let after: string
    let source: DescriptionChange['source'] = 'cleaned'
    let reason: RewriteResult['reason'] | undefined
    let flags: ClaimFlag[] | undefined

    if (ai) {
      const result = await rewriteDescription({
        title: product.title,
        category: product.category,
        description: product.description,
      })
      after = result.text
      source = result.source
      reason = result.reason
      flags = result.flags
      if (result.source === 'ai') aiUsed += 1
      else fellBack += 1
    } else {
      after = cleanDescription(product.description)
    }

    if (after === product.description) {
      unchanged += 1
      continue
    }

    changes.push({ id: product.id, title: product.title, before: product.description, after, source, reason, flags })
  }

  if (!write || changes.length === 0) {
    return { scanned: batch.length, changes, unchanged, aiUsed, fellBack, founderWritten, editedMeanwhile: 0, written: false }
  }

  /*
    One write for the batch. The batch is the caller's unit of progress, so
    finishing it and losing the write would be the worst of both.

    Only the description, onto each product as it is at write time — and only
    where the description is still the text this pass read. The AI pass takes
    seconds a product; a founder who saved a new description in Shop listing
    meanwhile would otherwise have it replaced by a rewrite of the OLD text,
    with the page still saying their version was saved.
  */
  const pending = new Map(changes.map((c) => [c.id, c]))
  const saved = await updateImportedProducts((current) => {
    const products: CatalogueProduct[] = []
    for (const p of current) {
      const change = pending.get(p.id)
      if (!change || p.description !== change.before) continue
      products.push(withCleanedDescription(p, change))
    }
    return { products, result: new Set(products.map((p) => p.id)) }
  })

  const kept = changes.filter((c) => saved.has(c.id))
  const skipped = changes.filter((c) => !saved.has(c.id))
  return {
    scanned: batch.length,
    changes: kept,
    unchanged,
    // The counts describe what was SAVED: a rewrite thrown away because the
    // founder got there first was not kept, and did not fall back to anything.
    aiUsed: aiUsed - skipped.filter((c) => c.source === 'ai').length,
    fellBack: fellBack - (ai ? skipped.filter((c) => c.source !== 'ai').length : 0),
    founderWritten,
    editedMeanwhile: skipped.length,
    written: kept.length > 0,
  }
}

/**
 * The product with this pass's description, and the review saying where it came from.
 *
 * A kept rewrite is the model's (`ai`), and on a product still waiting for
 * review it needs looking at again — whatever was confirmed was other words.
 * Leaving the source as it was had a second cost: a pull refreshes a field
 * whose source says `supplier`, so the next "Pull from PowerBody" put the
 * supplier's original copy — health claims and all, the very thing the rewrite
 * is claim-gated to remove — back in the shop.
 *
 * The plain markup strip keeps the source: the words are still whoever's they
 * were, cleaned exactly as the import cleans PowerBody's own copy, so a pull
 * that brings that copy again brings the same text.
 */
function withCleanedDescription(product: CatalogueProduct, change: DescriptionChange): CatalogueProduct {
  const next = { ...product, description: change.after }
  if (change.source !== 'ai' || !next.review) return next
  return {
    ...next,
    review: {
      ...next.review,
      sources: { ...next.review.sources, description: 'ai' },
      confirmed:
        next.review.status === 'pending' ? next.review.confirmed.filter((k) => k !== 'description') : next.review.confirmed,
    },
  }
}
