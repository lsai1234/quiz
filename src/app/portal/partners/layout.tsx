import { SubNav, type SubNavItem } from '@/components/portal/SubNav'

/**
 * Partners — the influencer programme, in one tab.
 *
 * Two views of the same relationship: who they are and what deal they are on,
 * and what we owe them. Split because they are answered at different moments —
 * you set a partner up once and settle with them every month.
 */
const ITEMS: SubNavItem[] = [
  { href: '/portal/partners', label: 'Partners', exact: true },
  { href: '/portal/partners/payouts', label: 'Payouts' },
]

export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SubNav
        title="Partners"
        blurb="Influencers who bring people in on their own code, and what we owe them."
        items={ITEMS}
      />
      {children}
    </div>
  )
}
