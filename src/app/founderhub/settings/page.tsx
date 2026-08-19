import { SettingsIndex } from '@/components/portal/SettingsNav'

/**
 * Settings — the index.
 *
 * Five topics with nothing to do with each other, so they are five pages rather
 * than one scroll. `SettingsNav` holds the list; this renders it.
 */
export default function SettingsPage() {
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
        Settings
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
        Where the app reads products, stock and payments from, and the two marketing features.
        Each integration defaults to mock while we build.
      </p>
      <SettingsIndex />
    </div>
  )
}
