import { IntegrationToggle } from '@/components/portal/IntegrationToggle'
import { StripeEnvironmentToggle } from '@/components/portal/StripeEnvironmentToggle'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('payments')!

const PAYMENT_OPTIONS = [
  { mode: 'mock', label: 'Mock payments', desc: 'Checkout returns a placeholder — no charge. Best while building.' },
  { mode: 'auto', label: 'Auto', desc: 'Use Stripe when credentials exist, otherwise mock.' },
  { mode: 'stripe', label: 'Live Stripe', desc: 'Always use Stripe. Falls back to mock if no credentials.' },
]

/**
 * Two switches, in the order the questions get asked.
 *
 * First: does checkout charge anybody at all? Second: in which Stripe account —
 * the test one or the live one? They are separate settings because they are
 * separate decisions with separate stakes, and because collapsing them would
 * mean a founder dropping to mock for an afternoon also forgets which world
 * they were in.
 */
export default function PaymentsSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <section className="space-y-3">
        <h2
          style={{
            fontSize: 'var(--text-body-sm)',
            fontFamily: 'var(--font-display)',
            color: 'var(--ink-1)',
          }}
        >
          How checkout takes money
        </h2>
        <IntegrationToggle
          endpoint="/api/portal/payment-source"
          options={PAYMENT_OPTIONS}
          liveLabel="Live Stripe"
          credentialsHint={<><strong>Can’t switch to Stripe yet.</strong> No secret key is set for the selected Stripe environment — add <code>STRIPE_TEST_SECRET_KEY</code> (or <code>STRIPE_LIVE_SECRET_KEY</code>), then switch. Still using mock payments.</>}
        />
      </section>

      <section className="space-y-3" style={{ marginTop: 'var(--space-6)' }}>
        <h2
          style={{
            fontSize: 'var(--text-body-sm)',
            fontFamily: 'var(--font-display)',
            color: 'var(--ink-1)',
          }}
        >
          Which Stripe
        </h2>
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--ink-3)', lineHeight: 'var(--leading-loose)' }}>
          A Stripe account is really two: test mode and live mode have separate keys, customers and
          payments, and nothing crosses between them. Both key sets live in the environment at once,
          so this is a switch rather than a redeploy.
        </p>
        <StripeEnvironmentToggle />
      </section>
    </SettingsDetail>
  )
}
