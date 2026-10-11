import { redirect } from 'next/navigation'
import { productHref } from '@/lib/portal/product-links'

/**
 * A product's old page, under the Dashboard. Every product now has one page,
 * at `item/[id]`, holding everything this one did (the SKU tree, the prices)
 * and everything that used to need a modal on another screen. Kept so a link
 * in an old email or a bookmark opens the same product.
 */
export default async function DashboardProductRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // `productHref` encodes the id itself, so it is handed over decoded — and a
  // segment that will not decode is passed through as it came rather than
  // turning an old bookmark into a crash.
  let raw = id
  try {
    raw = decodeURIComponent(id)
  } catch {
    /* not percent-encoded after all */
  }
  redirect(productHref(raw))
}
