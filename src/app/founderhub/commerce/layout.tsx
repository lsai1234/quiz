import { SubNav, type SubNavItem } from '@/components/portal/SubNav'

/**
 * Commerce — money in, orders out.
 *
 * One-off orders, monthly subscriptions, the supplier review queue, exits and
 * the month's financials are views of the same ledger, so they live in one tab
 * rather than being scattered across the top bar. The queue sits here rather
 * than under Products because it is a decision about an order, not a product;
 * Exits sits here because an uncollected settlement is money owed, and money
 * owed belongs next to the money that came in.
 *
 * Returns live on Exits rather than in a tab of their own. A 14-day return IS an
 * exit — the same member, the same record, the same money — and splitting them
 * would put the parcel on one screen and the refund it decides on another.
 */
const ITEMS: SubNavItem[] = [
  { href: '/founderhub/commerce/queue', label: 'Review queue' },
  { href: '/founderhub/commerce/orders', label: 'Single orders' },
  { href: '/founderhub/commerce/subscriptions', label: 'Subscriptions' },
  { href: '/founderhub/commerce/exits', label: 'Exits & returns' },
  { href: '/founderhub/commerce/financials', label: 'Financials' },
]

export default function CommerceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SubNav
        title="Commerce"
        blurb="Every order and subscription, what still needs your sign-off, and what it all made."
        items={ITEMS}
      />
      {children}
    </div>
  )
}
