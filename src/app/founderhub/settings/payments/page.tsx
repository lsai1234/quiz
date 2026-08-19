import { IntegrationToggle } from '@/components/portal/IntegrationToggle'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('payments')!

const PAYMENT_OPTIONS = [
  { mode: 'mock', label: 'Mock payments', desc: 'Checkout returns a placeholder — no charge. Best while building.' },
  { mode: 'auto', label: 'Auto', desc: 'Use Stripe when credentials exist, otherwise mock.' },
  { mode: 'stripe', label: 'Live Stripe', desc: 'Always use Stripe. Falls back to mock if no credentials.' },
]

export default function PaymentsSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <section>
        <IntegrationToggle
          endpoint="/api/portal/payment-source"
          options={PAYMENT_OPTIONS}
          liveLabel="Live Stripe"
          credentialsHint={<><strong>Can’t switch to Stripe yet.</strong> No secret key is set — add <code>STRIPE_SECRET_KEY</code> (and <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code>), then switch. Still using mock payments.</>}
        />
      </section>
    </SettingsDetail>
  )
}
