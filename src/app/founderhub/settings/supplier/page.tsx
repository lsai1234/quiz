import { IntegrationToggle } from '@/components/portal/IntegrationToggle'
import { OrderSendingToggle } from '@/components/portal/OrderSendingToggle'
import { SupplierDiagnostics } from '@/components/portal/SupplierDiagnostics'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('supplier')!

const SUPPLIER_OPTIONS = [
  { mode: 'mock', label: 'Mock supplier', desc: 'Use the built-in PowerBody sample feed. Best while building.' },
  { mode: 'auto', label: 'Auto', desc: 'Use PowerBody when credentials exist, otherwise mock.' },
  { mode: 'powerbody', label: 'Live PowerBody', desc: 'Always use the PowerBody API. Falls back to mock if no credentials.' },
]

const heading = {
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-strong)',
  fontFamily: 'var(--font-display)',
  color: 'var(--ink-1)',
  marginBottom: 'var(--space-2)',
} as const

const blurb = {
  fontSize: 'var(--text-meta)',
  lineHeight: 'var(--leading-snug)',
  color: 'var(--ink-3)',
  marginBottom: 'var(--space-3)',
} as const

/**
 * Reading and writing are two switches on one page, deliberately.
 *
 * They are separate settings — the catalogue can run fully live while every
 * order is still simulated — but they are the same relationship, and keeping
 * them apart made it easy to change one believing you had changed both.
 */
export default function SupplierSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <section>
        <h2 style={heading}>Where we read from</h2>
        <p style={blurb}>
          The catalogue and live stock/prices. Reading only — whether orders are actually placed is
          the separate switch below.
        </p>
        <IntegrationToggle
          endpoint="/api/portal/supplier-source"
          options={SUPPLIER_OPTIONS}
          liveLabel="Live PowerBody"
          credentialsHint={<><strong>Can’t switch to PowerBody yet.</strong> No API credentials are set — add <code>POWERBODY_API_URL</code>, <code>POWERBODY_API_USER</code> and <code>POWERBODY_API_KEY</code>, then switch. Still serving the mock feed.</>}
        />
      </section>

      <section>
        <h2 style={heading}>Order sending</h2>
        <p style={blurb}>
          What the Send button in the fulfilment queue actually does. Deliberately separate from the
          setting above, so the catalogue can run fully live while orders are still simulated.
        </p>
        <OrderSendingToggle />
      </section>

      <section>
        <h2 style={heading}>Test the integration</h2>
        <p style={blurb}>
          Every read-only call we make to PowerBody, run one at a time, so a failure names the call
          rather than the screen. This is <code>docs/E2E_TEST_PLAN.md</code> phase B as a button —
          including the one that matters most before importing anything, which is whether{' '}
          <code>getProductInfo</code> is enabled on the account. Nothing here writes; placing an
          order stays in Commerce → Review queue.
        </p>
        <SupplierDiagnostics />
      </section>
    </SettingsDetail>
  )
}
