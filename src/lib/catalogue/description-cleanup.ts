/**
 * The description cleanup, as one operation both callers share.
 *
 * There are two front ends — `scripts/clean-descriptions.ts` and the Founders
 * Hub panel — and exactly one implementation, deliberately. Two copies of "what
 * counts as needing a clean" would drift, and the hub would start disagreeing
 * with the script about how many products are broken.
 *
 * Only IMPORTED products are touched. The mock catalogue is source code, and
 * founder overrides are a separate layer that wins over this one anyway.
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
import { getImportedProducts, addImportedProducts } from '@/lib/portal/store'
import type { ClaimFlag } from '@/lib/shop/claim-safety'
import type { CatalogueProduct } from './types'

export interface DescriptionCandidate {
  id: string
  title: string
  /** Still carrying raw markup — needs the strip even without the AI pass. */
  hasMarkup: boolean
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
  /** False for a preview — nothing was written. */
  written: boolean
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
  const updated: CatalogueProduct[] = []
  let unchanged = 0
  let aiUsed = 0
  let fellBack = 0

  for (const product of batch) {
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
    updated.push({ ...product, description: after })
  }

  // One write for the batch. The batch is the caller's unit of progress, so
  // finishing it and losing the write would be the worst of both.
  if (write && updated.length > 0) await addImportedProducts(updated)

  return { scanned: batch.length, changes, unchanged, aiUsed, fellBack, written: write && updated.length > 0 }
}
