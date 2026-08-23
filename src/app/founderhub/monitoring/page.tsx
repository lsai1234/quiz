import { MonitoringPage } from '@/components/portal/MonitoringPage'

/**
 * Monitoring — is anything broken on the customer-facing surfaces?
 *
 * A top-level section rather than a settings page: settings is where you change
 * how the app behaves, and this is where you find out how it is behaving.
 */
export default function Monitoring() {
  return (
    <div>
      <h1
        style={{
          fontSize: 'var(--text-display)',
          fontWeight: 'var(--weight-display)',
          fontFamily: 'var(--font-display)',
          letterSpacing: 'var(--tracking-display)',
          lineHeight: 'var(--leading-tight)',
          color: 'var(--ink-1)',
        }}
      >
        Monitoring
      </h1>
      <p
        style={{
          fontSize: 'var(--text-body)',
          lineHeight: 'var(--leading-loose)',
          color: 'var(--ink-3)',
          marginTop: 'var(--space-2)',
          marginBottom: 'var(--space-8)',
          maxWidth: '42rem',
        }}
      >
        Errors from the quiz, the shop and My Hub, plus the checks that catch the failures
        nothing throws for — a webhook that stopped arriving, a job that stopped running.
      </p>
      <MonitoringPage />
    </div>
  )
}
