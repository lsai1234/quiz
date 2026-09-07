import type { CatalogueProduct } from '@/lib/catalogue/types'

/**
 * Shop section = a product category. A curated order gives the shop a sensible
 * retail flow (the everyday performance staples first, wellbeing after);
 * anything not in the list is appended alphabetically so a new supplier category
 * still shows up, just at the end.
 */
const CATEGORY_ORDER: string[] = [
  'Protein',
  'Performance',
  'Pre-Workout',
  'Amino Acids',
  'Hydration',
  'Recovery',
  'Health',
  'Gut Health',
  'Sleep',
  'Menopause Support',
]

/**
 * How much of a shelf the shop shows before you ask for the rest.
 *
 * The grid is two columns, and a shelf is capped at two ROWS — four products —
 * with everything past that behind one press. It is not about the products; it
 * is about the page. Twenty categories at their full length is a scroll nobody
 * reaches the bottom of, and the shelf below the one you are reading may as
 * well not exist: the fifteenth protein is seen by nobody, and neither is
 * Hydration.
 *
 * Four is deliberate rather than round. One row reads as a teaser and makes the
 * heading do all the work; three is most of a phone screen per category and
 * puts the next heading back off the bottom. Two rows is the most a shelf can
 * take and still let a thumb pass several shelves in a flick.
 */
export const SHELF_COLUMNS = 2
export const SHELF_PREVIEW_ROWS = 2
export const SHELF_PREVIEW_COUNT = SHELF_COLUMNS * SHELF_PREVIEW_ROWS

export interface ShopCategory {
  category: string
  /** URL/DOM-safe slug for the section anchor + nav. */
  slug: string
  products: CatalogueProduct[]
}

export function categorySlug(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function orderIndex(category: string): number {
  const i = CATEGORY_ORDER.indexOf(category)
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}

/**
 * Group products into ordered shop sections by category. Curated categories
 * come first in their defined order; the rest follow alphabetically. Product
 * order within a section is preserved (the catalogue's own ranking).
 */
export function groupByCategory(products: CatalogueProduct[]): ShopCategory[] {
  const byCategory = new Map<string, CatalogueProduct[]>()
  for (const p of products) {
    const cat = p.category || 'Other'
    const list = byCategory.get(cat)
    if (list) list.push(p)
    else byCategory.set(cat, [p])
  }

  return [...byCategory.entries()]
    .sort(([a], [b]) => {
      const ia = orderIndex(a)
      const ib = orderIndex(b)
      if (ia !== ib) return ia - ib
      return a.localeCompare(b)
    })
    .map(([category, list]) => ({ category, slug: categorySlug(category), products: list }))
}
