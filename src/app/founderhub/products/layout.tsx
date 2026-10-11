import { SubNav, type SubNavItem } from '@/components/portal/SubNav'
import { ReviewCountBadge } from '@/components/portal/products-list/ReviewCountBadge'
import { ADD_PRODUCTS_HREF, FIXUPS_HREF, PRODUCTS_HREF, REVIEW_HREF } from '@/lib/portal/product-links'

/**
 * Products — everything about what we sell, in one tab.
 *
 * ── Where things moved, and why ─────────────────────────────────────────────
 * This bar used to have nine views, three of which were the same products
 * shown three ways (Catalogue, Dashboard, Readiness), and a PowerBody tab that
 * was a pile of panels — adding products, repairing them and syncing them, all
 * on one scroll. A founder could not tell where to go to change what the shop
 * shows, because the honest answer was "it depends which screen you are on".
 *
 * Now each job has one place, in the order the work happens:
 *   Products     every product, one list; each opens its own page, the one
 *                place anything about a product is changed
 *   Add products bring products in from PowerBody, guided, one step at a time
 *   Review       what was added, checked before it goes on sale
 *   Fix-ups      passes over the whole catalogue (descriptions, names, prices)
 * and then the four that were never part of the muddle: the Top 25 roster, the
 * packages that sell the products, and whether the range covers the quiz.
 *
 * The old addresses redirect (`dashboard`, `readiness`, `powerbody`), so a
 * bookmark or a link in an old email still lands somewhere sensible.
 */
const ITEMS: SubNavItem[] = [
  // A product's own page belongs to the list it was opened from.
  { href: PRODUCTS_HREF, label: 'Products', exact: true, activeFor: [`${PRODUCTS_HREF}/item/`] },
  { href: ADD_PRODUCTS_HREF, label: 'Add products' },
  // Next to Add because it is the second half of the same job: nothing added
  // is on sale until it has been through here. The badge is how many wait.
  { href: REVIEW_HREF, label: 'Review', badge: <ReviewCountBadge /> },
  { href: FIXUPS_HREF, label: 'Fix-ups' },
  { href: '/founderhub/products/top-25', label: 'Top 25' },
  // The packages, then the stacks that sell them. In that order because that
  // is the order the work happens in: a session stack picks a pre-built one.
  { href: '/founderhub/products/prebuilt', label: 'Pre-built bundles' },
  { href: '/founderhub/products/bundles', label: 'Session stacks' },
  { href: '/founderhub/products/coverage', label: 'Coverage' },
]

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SubNav
        title="Products"
        blurb="Every product we sell, where it comes from, and whether it is ready to sell."
        items={ITEMS}
      />
      {children}
    </div>
  )
}
