import { SubNav, type SubNavItem } from '@/components/portal/SubNav'

/**
 * Partners — both programmes, in one tab.
 *
 * Two views of the same relationship: who they are and what deal they are on,
 * and what we owe them. Split because they are answered at different moments —
 * you set a partner up once and settle with them every month.
 *
 * Influencers and affiliates share this screen rather than getting one each.
 * They differ at sign-up and in the shape of the deal; from here on they are
 * the same list, the same codes, the same ledger and the same payout run, and
 * two screens would mean settling up in two places every month.
 */
const ITEMS: SubNavItem[] = [
  { href: '/founderhub/partners', label: 'Partners', exact: true },
  { href: '/founderhub/partners/payouts', label: 'Payouts' },
]

export default function PartnersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SubNav
        title="Partners"
        blurb="Influencers and affiliates who bring people in on their own code, and what we owe them."
        items={ITEMS}
      />
      {children}
    </div>
  )
}
