import { StockAlerts } from '@/components/portal/StockAlerts'

export const dynamic = 'force-dynamic'

export default function StockAlertsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>Stock alerts</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Live subscriptions whose product has gone out of stock at PowerBody. Swap in the same-category
          replacement for members who allow it, or skip / notify for those who don&apos;t. Runs daily; run it now below.
        </p>
      </div>
      <StockAlerts />
    </div>
  )
}
