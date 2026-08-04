import { SubNav, type SubNavItem } from '@/components/portal/SubNav'

/**
 * Products — everything about what we sell, in one tab.
 *
 * These used to be seven separate top-level destinations, which made the range
 * feel like seven unrelated jobs. They are all the same job: get the catalogue
 * right. Sourcing it (PowerBody), describing it (Catalogue, Top 25), checking it
 * (Readiness, Coverage) and packaging it (Bundles) belong together.
 */
const ITEMS: SubNavItem[] = [
  { href: '/portal/products', label: 'Catalogue', exact: true },
  { href: '/portal/products/top-25', label: 'Top 25' },
  { href: '/portal/products/bundles', label: 'Bundles' },
  { href: '/portal/products/powerbody', label: 'PowerBody' },
  { href: '/portal/products/dashboard', label: 'Dashboard' },
  { href: '/portal/products/readiness', label: 'Readiness' },
  { href: '/portal/products/coverage', label: 'Coverage' },
]

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SubNav
        title="Products"
        blurb="The range, where it comes from, and whether it's ready to sell."
        items={ITEMS}
      />
      {children}
    </div>
  )
}
