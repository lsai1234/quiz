/**
 * Bulk product import (CSV) for the Founders Hub.
 *
 * Founders fill the CSV template (download from the Import page) with Olivit (or
 * any supplier) products and upload it. We parse it without any dependency,
 * validate each row, and map valid rows to `CatalogueProduct`s ready to be added
 * to the catalogue (mock) or pushed to Shopify (live).
 *
 * Template columns (header row, order-independent):
 *   handle, title, description, category, price, compare_at_price, cost, sku,
 *   flavours, image_url, days_of_supply, subscription_eligible
 *
 * `flavours` and `sku` are pipe-separated lists ("Chocolate|Vanilla"). When more
 * than one flavour is given, one variant is created per flavour (sharing price /
 * compare-at). SKUs are matched to flavours by position; a single SKU with
 * multiple flavours is suffixed per variant.
 */
import type { CatalogueProduct, CatalogueVariant } from '@/lib/catalogue/types'

export const IMPORT_COLUMNS = [
  'handle', 'title', 'description', 'category', 'price', 'compare_at_price',
  'cost', 'sku', 'flavours', 'image_url', 'days_of_supply', 'subscription_eligible',
] as const

export interface ParsedRow {
  /** 1-based row number in the source file (excluding the header). */
  row: number
  raw: Record<string, string>
  product?: CatalogueProduct
  errors: string[]
}

export interface ImportPreview {
  rows: ParsedRow[]
  validCount: number
  errorCount: number
}

// ─── CSV parsing (dependency-free, RFC-4180-ish) ────────────────────────────────

/** Parse CSV text into rows of cells. Handles quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  // Strip a leading UTF-8 BOM if present.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      // Close the row on newline; swallow the \n of a \r\n pair.
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else {
      field += c
    }
  }
  // Flush the final field/row when the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }

  // Drop fully-blank rows (trailing newlines etc.).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

// ─── Validation + mapping ────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function rowToProduct(raw: Record<string, string>): { product?: CatalogueProduct; errors: string[] } {
  const errors: string[] = []
  const title = raw.title?.trim()
  const handle = slugify(raw.handle?.trim() || title || '')
  const price = parseFloat(raw.price)
  const compareAt = raw.compare_at_price?.trim() ? parseFloat(raw.compare_at_price) : null
  const cost = raw.cost?.trim() ? parseFloat(raw.cost) : undefined
  const daysOfSupply = raw.days_of_supply?.trim() ? parseInt(raw.days_of_supply, 10) : 30

  if (!title) errors.push('title is required')
  if (!handle) errors.push('handle/title is required to derive an id')
  if (!raw.price?.trim()) errors.push('price is required')
  else if (Number.isNaN(price) || price < 0) errors.push('price must be a non-negative number')
  if (compareAt != null && Number.isNaN(compareAt)) errors.push('compare_at_price must be a number')
  if (cost != null && Number.isNaN(cost)) errors.push('cost must be a number')

  const flavours = (raw.flavours ?? '').split('|').map((f) => f.trim()).filter(Boolean)
  const skus = (raw.sku ?? '').split('|').map((s) => s.trim()).filter(Boolean)

  if (errors.length > 0) return { errors }

  const subscriptionEligible = /^(true|yes|y|1)$/i.test((raw.subscription_eligible ?? '').trim())

  const variants: CatalogueVariant[] =
    flavours.length > 0
      ? flavours.map((flavour, i) => ({
          id: `${handle}-${slugify(flavour)}`,
          title: flavour,
          flavour,
          size: null,
          price,
          compareAtPrice: compareAt,
          available: true,
          sku: skus[i] ?? (skus[0] ? `${skus[0]}-${i + 1}` : null),
          shopifyVariantId: null,
        }))
      : [{
          id: handle,
          title: title!,
          flavour: null,
          size: null,
          price,
          compareAtPrice: compareAt,
          available: true,
          sku: skus[0] ?? null,
          shopifyVariantId: null,
        }]

  const product: CatalogueProduct = {
    id: handle,
    title: title!,
    handle,
    description: raw.description?.trim() || '',
    imageUrl: raw.image_url?.trim() || null,
    category: raw.category?.trim() || 'Uncategorised',
    stackSlots: [],
    goals: [],
    dietaryTags: [],
    formats: [],
    variants,
    basePrice: price,
    compareAtPrice: compareAt,
    cost,
    subscriptionEligible,
    subscriptionProductId: null,
    isSubscriptionOnly: false,
    daysOfSupply: Number.isNaN(daysOfSupply) ? 30 : daysOfSupply,
    swapGroup: 'general',
    recommendationPriority: 5,
    marginPriority: 5,
    isCoreEligible: false,
    isBoosterEligible: false,
    hasStimulants: false,
    shortReason: '',
    warnings: [],
    shopifyProductId: null,
  }
  return { product, errors }
}

/** Parse + validate a CSV string into an import preview. */
export function parseImportCsv(csv: string): ImportPreview {
  const grid = parseCsv(csv)
  if (grid.length === 0) {
    return { rows: [], validCount: 0, errorCount: 0 }
  }
  const header = grid[0].map((h) => h.trim().toLowerCase())
  const rows: ParsedRow[] = []

  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r]
    const raw: Record<string, string> = {}
    header.forEach((h, i) => { raw[h] = cells[i] ?? '' })
    const { product, errors } = rowToProduct(raw)
    rows.push({ row: r, raw, product, errors })
  }

  const validCount = rows.filter((r) => r.errors.length === 0).length
  return { rows, validCount, errorCount: rows.length - validCount }
}

/** The CSV template contents served from the Import page. */
export const IMPORT_TEMPLATE_CSV = `${IMPORT_COLUMNS.join(',')}
chrgd-creatine,CHRGD Creatine Monohydrate,"Pure micronised creatine, 5g per serving.",Performance,24.99,29.99,8.50,OLV-CRE-300,Unflavoured,https://example.com/creatine.jpg,60,true
chrgd-greens,CHRGD Daily Greens,"Greens blend with 25 superfoods.",Health,29.99,,11.00,OLV-GRN-01|OLV-GRN-02,Berry|Original,https://example.com/greens.jpg,30,true
`
