import { RosterImport } from '@/components/portal/RosterImport'
import { SupplierIndexBuilder } from '@/components/portal/SupplierIndexBuilder'
import { SupplierImport } from '@/components/portal/SupplierImport'
import { SupplierSyncPanel } from '@/components/portal/SupplierSyncPanel'

export const dynamic = 'force-dynamic'

export default function SupplierPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black mb-1" style={{ color: 'var(--ink-1)', fontFamily: 'var(--font-display)' }}>PowerBody</h2>
        <p className="text-sm text-[var(--ink-3)]">
          Pull products in from PowerBody by SKU. Each one comes back in full — picture, name, brand, live stock, what
          we pay and what we would make — and lands in Review before it can be sold.
        </p>
      </div>

      {/* What moved under us since yesterday — read before adding anything new. */}
      <SupplierSyncPanel />

      {/* Crawled first, because the roster import resolves every code through
          it — see SupplierIndexBuilder. */}
      <SupplierIndexBuilder />

      {/* A whole roster at once, enriched per row — see RosterImport. */}
      <RosterImport />

      <SupplierImport />
    </div>
  )
}
