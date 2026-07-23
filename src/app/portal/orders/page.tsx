import { OrdersList } from '@/components/portal/OrdersList'

export const dynamic = 'force-dynamic'

export default function OrdersPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Orders</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Every shop, quiz and subscription order. Open one to submit it to PowerBody, sync its status, or refund it.
        </p>
      </div>
      <OrdersList />
    </div>
  )
}
