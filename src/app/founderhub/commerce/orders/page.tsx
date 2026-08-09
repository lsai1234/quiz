import { OrdersList } from '@/components/portal/OrdersList'

export const dynamic = 'force-dynamic'

/**
 * Single orders — one-off purchases from the shop and the quiz.
 *
 * Subscription renewals are orders too, but they belong with the plan that
 * created them (the Subscriptions tab) and get lost in a list that mixes them
 * in — so this opens on one-off. The channel filter still reaches everything.
 */
export default function OrdersPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
          Single orders
        </h2>
        <p className="text-sm text-[var(--color-muted)] mt-0.5">
          Every one-off purchase from the shop and the quiz. Open one to approve it, send it to PowerBody,
          sync its status, or refund it.
        </p>
      </div>
      <OrdersList defaultChannel="one-off" />
    </div>
  )
}
