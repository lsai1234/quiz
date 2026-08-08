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
  { href: '/founderhub/products', label: 'Catalogue', exact: true },
  { href: '/founderhub/products/top-25', label: 'Top 25' },
  { href: '/founderhub/products/bundles', label: 'Bundles' },
  { href: '/founderhub/products/powerbody', label: 'PowerBody' },
  // Sits next to PowerBody because it is the second half of the same job:
  // nothing imported there is on sale until it has been through here.
  { href: '/founderhub/products/review', label: 'Review' },
  { href: '/founderhub/products/dashboard', label: 'Dashboard' },
  { href: '/founderhub/products/readiness', label: 'Readiness' },
  { href: '/founderhub/products/coverage', label: 'Coverage' },
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
