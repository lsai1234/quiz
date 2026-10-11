import { redirect } from 'next/navigation'
import { ADD_PRODUCTS_HREF } from '@/lib/portal/product-links'

/**
 * The old PowerBody tab. Adding products from PowerBody is now the guided Add
 * products page; the repair panels that shared this screen moved to Fix-ups,
 * and the nightly sync report with them. Kept so the address still goes
 * somewhere — Add, because that is what almost everyone came here to do.
 */
export default function PowerBodyRedirect() {
  redirect(ADD_PRODUCTS_HREF)
}
