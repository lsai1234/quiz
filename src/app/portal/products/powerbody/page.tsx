import { SupplierBrowser } from '@/components/portal/SupplierBrowser'

export const dynamic = 'force-dynamic'

export default function SupplierPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>PowerBody</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Scan the PowerBody supplier feed and add the products you want into your catalogue. Only what you add shows up in the shop and quiz.
          Live stock, wholesale cost and margin are shown for each item.
        </p>
      </div>
      <SupplierBrowser />
    </div>
  )
}
