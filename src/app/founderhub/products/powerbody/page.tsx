import { SupplierImport } from '@/components/portal/SupplierImport'
import { SupplierSyncPanel } from '@/components/portal/SupplierSyncPanel'

export const dynamic = 'force-dynamic'

export default function SupplierPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black mb-1" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>PowerBody</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Pull products in from PowerBody by SKU. Each one comes back in full — picture, name, brand, live stock, what
          we pay and what we would make — and lands in Review before it can be sold.
        </p>
      </div>

      {/* What moved under us since yesterday — read before adding anything new. */}
      <SupplierSyncPanel />

      <SupplierImport />
    </div>
  )
}
