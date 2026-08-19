import { DataSourceToggle } from '@/components/portal/DataSourceToggle'
import { IntegrationToggle } from '@/components/portal/IntegrationToggle'
import { OrderSendingToggle } from '@/components/portal/OrderSendingToggle'
import { SupplierDiagnostics } from '@/components/portal/SupplierDiagnostics'
import { CompetitionSettings } from '@/components/portal/CompetitionSettings'
import { ShareArtSettings } from '@/components/portal/ShareArtSettings'

const SUPPLIER_OPTIONS = [
  { mode: 'mock', label: 'Mock supplier', desc: 'Use the built-in PowerBody sample feed. Best while building.' },
  { mode: 'auto', label: 'Auto', desc: 'Use PowerBody when credentials exist, otherwise mock.' },
  { mode: 'powerbody', label: 'Live PowerBody', desc: 'Always use the PowerBody API. Falls back to mock if no credentials.' },
]

const PAYMENT_OPTIONS = [
  { mode: 'mock', label: 'Mock payments', desc: 'Checkout returns a placeholder — no charge. Best while building.' },
  { mode: 'auto', label: 'Auto', desc: 'Use Stripe when credentials exist, otherwise mock.' },
  { mode: 'stripe', label: 'Live Stripe', desc: 'Always use Stripe. Falls back to mock if no credentials.' },
]

const heading = { color: 'var(--ink-1)', fontFamily: 'var(--font-display)' } as const

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black mb-1" style={heading}>Settings</h1>
        <p className="text-sm text-[var(--ink-3)]">Choose where the app reads products, stock and payments from. Each defaults to mock while we build.</p>
      </div>

      <section>
        <h2 className="text-sm font-bold mb-2" style={heading}>Competition</h2>
        <p className="text-xs text-[var(--ink-3)] mb-2">
          The share-card giveaway. Off by default; <strong>Test</strong> runs the whole flow as a
          rehearsal. Going live needs the wording a prize draw legally has to carry, and this
          screen will not let it until every field is filled in.
        </p>
        <CompetitionSettings />
      </section>

      <section>
        <h2 className="text-sm font-bold mb-2" style={heading}>Share card photography</h2>
        <p className="text-xs text-[var(--ink-3)] mb-2">
          One photograph per category, printed full-bleed behind the stack on every share card.
          The preview shows the crop the card actually uses, not the whole picture — the bottom
          fifth is cut off — and the guide marks where the charge index is ghosted over the frame.
        </p>
        <ShareArtSettings />
      </section>

      <section>
        <h2 className="text-sm font-bold mb-2" style={heading}>Data source</h2>
        <DataSourceToggle />
      </section>

      <section>
        <h2 className="text-sm font-bold mb-2" style={heading}>Supplier (PowerBody)</h2>
        <p className="text-xs text-[var(--ink-3)] mb-2">Where the catalogue and live stock/prices are read from. Reading only — whether orders are actually placed is the separate switch below.</p>
        <IntegrationToggle
          endpoint="/api/portal/supplier-source"
          options={SUPPLIER_OPTIONS}
          liveLabel="Live PowerBody"
          credentialsHint={<><strong>Can’t switch to PowerBody yet.</strong> No API credentials are set — add <code>POWERBODY_API_URL</code>, <code>POWERBODY_API_USER</code> and <code>POWERBODY_API_KEY</code>, then switch. Still serving the mock feed.</>}
        />
      </section>

      <section>
        <h2 className="text-sm font-bold mb-2" style={heading}>Test the supplier integration</h2>
        <p className="text-xs text-[var(--ink-3)] mb-2">
          Every read-only call we make to PowerBody, run one at a time, so a failure names the call
          rather than the screen. This is <code>docs/E2E_TEST_PLAN.md</code> phase B as a button —
          including the one that matters most before importing anything, which is whether{' '}
          <code>getProductInfo</code> is enabled on the account. Nothing here writes; placing an
          order stays in Commerce → Review queue.
        </p>
        <SupplierDiagnostics />
      </section>

      <section>
        <h2 className="text-sm font-bold mb-2" style={heading}>Order sending</h2>
        <p className="text-xs text-[var(--ink-3)] mb-2">
          What the Send button in the fulfilment queue actually does. Deliberately separate from the supplier
          setting above, so the catalogue can run fully live while orders are still simulated.
        </p>
        <OrderSendingToggle />
      </section>

      <section>
        <h2 className="text-sm font-bold mb-2" style={heading}>Payments (Stripe)</h2>
        <p className="text-xs text-[var(--ink-3)] mb-2">How the shop, quiz and subscriptions take payment.</p>
        <IntegrationToggle
          endpoint="/api/portal/payment-source"
          options={PAYMENT_OPTIONS}
          liveLabel="Live Stripe"
          credentialsHint={<><strong>Can’t switch to Stripe yet.</strong> No secret key is set — add <code>STRIPE_SECRET_KEY</code> (and <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>), then switch. Still using mock payments.</>}
        />
      </section>
    </div>
  )
}
