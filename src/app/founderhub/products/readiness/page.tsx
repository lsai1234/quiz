import { redirect } from 'next/navigation'
import { productsHref } from '@/lib/portal/product-links'

/**
 * The old Readiness screen: every product, worst first, with its failing
 * checks. That is now the Products list's "needs attention" view — blocking
 * problems first, then warnings, each check linking to the section that fixes
 * it — so this address opens that view.
 */
export default function ReadinessRedirect() {
  redirect(productsHref('attention'))
}
