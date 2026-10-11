import { redirect } from 'next/navigation'
import { PRODUCTS_HREF } from '@/lib/portal/product-links'

/**
 * The old Product dashboard. It was the second of two lists of the same
 * products (the Catalogue was the first), so both became the one Products list
 * — this address stays so a bookmark still lands there.
 */
export default function DashboardRedirect() {
  redirect(PRODUCTS_HREF)
}
