/**
 * The supplier feed as a spreadsheet.
 *
 * Kept out of the route so the formatting can be tested without standing up a
 * request, and because the awkward part is CSV quoting rather than HTTP.
 */
import type { SupplierStockLevel } from './types'
import { listPriceFor } from '@/lib/pricing/list-price'

/** The columns, in the order a person reading the file would want them. */
const COLUMNS = [
  'productId',
  'sku',
  'wholesalePrice',
  'sellPrice',
  'stock',
  'inStock',
  'updatedAt',
] as const

/**
 * One CSV field.
 *
 * Quoted whenever the value could otherwise break the row — a comma, a quote, a
 * newline — and also when it merely *looks* like a number Excel would rewrite.
 * PowerBody codes are the reason: a SKU of `00123` opened as a number loses its
 * leading zeros, and a mapping file whose keys have been silently edited is
 * worse than no mapping file. Quoting alone does not stop every spreadsheet
 * from coercing, but it is what the format offers, and it keeps the file
 * correct for everything that parses it properly.
 */
function field(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(s) || /^0\d/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * The feed as CSV: the SKU → product id mapping, plus what each costs and
 * whether it is in stock.
 *
 * `sellPrice` is included because it is derived, not fetched — our own list
 * rule (cost × 2 → .99) applied to today's cost — so a founder can see what a
 * product would go on the shelf at without opening the hub. It is the same
 * number `toSupplierRow` shows.
 *
 * Rows keep the feed's own order. Sorting them would be a small kindness and a
 * real loss: the order products come back in is the order they page in, which is
 * what tells you whether a truncated read stopped early.
 */
export function toFeedCsv(levels: SupplierStockLevel[]): string {
  const lines = [COLUMNS.join(',')]
  for (const level of levels) {
    lines.push(
      [
        field(level.productId ?? ''),
        field(level.sku),
        field(level.wholesalePrice.toFixed(2)),
        field(listPriceFor(level.wholesalePrice).toFixed(2)),
        field(level.stock),
        field(level.inStock ? 'yes' : 'no'),
        field(level.updatedAt),
      ].join(','),
    )
  }
  // A trailing newline: POSIX text, and it stops the last row being glued to
  // whatever a tool appends next.
  return `${lines.join('\n')}\n`
}
