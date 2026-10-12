import { REVIEW_FIELDS } from '@/lib/catalogue/review'
import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * The review queue's arithmetic, kept out of the components so it can be tested
 * without rendering anything — and so the queue, the bulk fill and their tests
 * cannot disagree about what "still needs PowerBody" means.
 */

/** One product waiting for review, as `GET /api/portal/products/review` sends it. */
export interface QueueEntry {
  product: CatalogueProduct
  /** Review fields still to check, by key. */
  remaining: string[]
  /** Every review field checked: approving it will be accepted. */
  complete: boolean
}

/** What the supplier could still fill in on a product. */
export interface SupplierGaps {
  hasPicture: boolean
  hasDescription: boolean
  /** SKUs on the product… */
  skus: number
  /** …and how many of them carry their PowerBody product id. */
  withIds: number
}

export function supplierGaps(product: CatalogueProduct): SupplierGaps {
  const skus = product.variants.filter((v) => Boolean(v.sku))
  // A one-SKU product may hold its id on the product rather than the SKU —
  // that is where imports before per-SKU ids put it, and it is the same id.
  const single = product.variants.length === 1
  const withIds = skus.filter((v) => Boolean(v.supplierProductId) || (single && Boolean(product.supplierProductId))).length
  return {
    hasPicture: Boolean(product.imageUrl),
    hasDescription: Boolean(product.description?.trim()),
    skus: skus.length,
    withIds,
  }
}

/**
 * Whether a pull from PowerBody could still add something.
 *
 * A product with a picture, a description and every SKU's PowerBody id has had
 * everything a pull fills in — asking again is a throttled call for nothing, and
 * a run of a hundred of those is what makes PowerBody start refusing. A product
 * with no SKU at all has nothing to ask about.
 */
export function needsPull(product: CatalogueProduct): boolean {
  const gaps = supplierGaps(product)
  if (gaps.skus === 0) return false
  return !gaps.hasPicture || !gaps.hasDescription || gaps.withIds < gaps.skus
}

/** The review fields' own names, for "3 left: Stack slots, Goals, Card copy". */
export function fieldLabels(keys: string[]): string[] {
  return keys.map((key) => REVIEW_FIELDS.find((f) => (f.key as string) === key)?.label ?? key)
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export const money = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? `£${n.toFixed(2)}` : null)

// ── What a pull answered, read for a stop ───────────────────────────────────

/** The result line of `POST /api/portal/products/pull {stream:true}`. */
export interface PullResult {
  ok?: boolean
  status?: number
  error?: string
  filled?: string[]
  changed?: Record<string, string>
  answered?: number
  unresolved?: Array<{ sku: string; message: string; refusal?: Exclude<StopKind, 'sample' | 'server'> }>
  /** PowerBody's refusal, with its kind, when the pull met one. */
  refused?: { kind: Exclude<StopKind, 'sample' | 'server'>; message: string } | null
  trace?: Array<{ message?: string }>
  product?: CatalogueProduct
  remaining?: string[]
}

/**
 * Why a bulk fill must stop rather than carry on to the next product.
 *
 *   rate-limited    PowerBody are throttling us; every next request makes it worse
 *   sandbox         their DEMO account cannot look anything up
 *   credentials     our login was refused
 *   supplier-error  PowerBody would not answer, in their words
 *   sample          the supplier is set to Sample, so nothing reaches PowerBody
 *   server          our own server could not save — the next one would fail too
 *
 * Every one of these is true of the NEXT product as much as this one, which is
 * the whole reason to stop: twenty more requests into a refusal teach nothing
 * and can lengthen a rate limit.
 */
export type StopKind = 'rate-limited' | 'sandbox' | 'credentials' | 'supplier-error' | 'sample' | 'server'

export interface PullStop {
  kind: StopKind
  /** PowerBody's (or our server's) own words. */
  message: string
}

/*
  The pull says when PowerBody refused, and how (`refused`, and `refusal` on
  each SKU it could not get). These patterns are the fallback for answers that
  carry only a sentence — the product route's own errors, the Sample supplier,
  an older server — and follow the wording of the resolver's `refusalOf`.
*/
const REFUSALS: Array<[Exclude<StopKind, 'server'>, RegExp]> = [
  ['rate-limited', /limiting how fast|rate.?limit|too many requests|\b429\b|throttl/i],
  ['sandbox', /\bDEMO\b|sandbox/],
  ['credentials', /did not accept our login|access denied|invalid session|not authori[sz]ed/i],
  ['sample', /supplier is set to Sample/i],
  ['supplier-error', /^PowerBody would not answer:|could not be reached/i],
]

function classify(message: string): Exclude<StopKind, 'server'> | null {
  for (const [kind, pattern] of REFUSALS) if (pattern.test(message)) return kind
  return null
}

/**
 * Read one product's pull result for a reason to stop the run. Null when the
 * run should carry on — including when this product simply had nothing new, or
 * a SKU "was not reached this time", which is about this product's budget and
 * says nothing about the next one.
 */
export function stopFor(result: PullResult): PullStop | null {
  if (result.ok === false) {
    const message = result.error ?? 'The pull failed.'
    const kind = classify(message)
    if (kind) return { kind, message }
    // A product that is gone or has no SKU is about that product only.
    if ((result.status ?? 500) >= 500) return { kind: 'server', message }
    return null
  }
  if (result.refused) return { kind: result.refused.kind, message: result.refused.message }
  for (const miss of result.unresolved ?? []) {
    if (miss.refusal) return { kind: miss.refusal, message: miss.message }
    const kind = classify(miss.message)
    if (kind) return { kind, message: miss.message }
  }
  // PowerBody answering for nothing, with "would not answer" in the trace, is
  // the detail call itself being refused before any SKU was searched for.
  if ((result.answered ?? 0) === 0) {
    for (const step of result.trace ?? []) {
      const message = step.message ?? ''
      const kind = classify(message)
      if (kind) return { kind, message }
    }
  }
  return null
}

/** One line for what a pull did to a product, for the run's log. */
export function pullSummary(result: PullResult): { tone: 'positive' | 'neutral' | 'attention'; text: string } {
  if (result.ok === false) return { tone: 'attention', text: result.error ?? 'The pull failed.' }
  const filled = (result.filled ?? []).filter((k) => !['cost', 'supplierRrp', 'supplierProductId'].includes(k))
  const words: Record<string, string> = {
    imageUrl: 'picture',
    description: 'description',
    category: 'category',
    brand: 'brand',
    weightGrams: 'weight',
    vatRate: 'VAT rate',
  }
  const skuNotes = Object.keys(result.changed ?? {}).length
  const parts: string[] = []
  if (filled.length > 0) parts.push(`Filled the ${filled.map((k) => words[k] ?? k).join(', ')}`)
  if (skuNotes > 0) parts.push(`updated ${plural(skuNotes, 'SKU')}`)
  const missed = result.unresolved ?? []
  if (missed.length > 0) {
    parts.push(`${plural(missed.length, 'SKU')} not found yet (${missed[0].sku}: ${missed[0].message})`)
  }
  if (parts.length === 0) {
    return { tone: 'neutral', text: 'PowerBody had nothing new for it — open it to fill the rest by hand.' }
  }
  const text = parts.join('; ')
  return { tone: missed.length > 0 ? 'attention' : 'positive', text: `${text.charAt(0).toUpperCase()}${text.slice(1)}.` }
}
