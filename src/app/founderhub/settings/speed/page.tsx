import { SpeedDiagnostics } from '@/components/portal/SpeedDiagnostics'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('speed')!

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
 * "Everything is taking ages" is a real report and an unfalsifiable one.
 *
 * It cannot be answered from a laptop: locally every screen answers in
 * single-digit milliseconds against a database in the same process, while the
 * deployed site is a different machine, in a region that may not be the
 * database's, starting a fresh server for each burst of traffic. The three
 * candidates — slow queries, a distant database, a cold start — feel identical
 * from the outside and want three different fixes.
 *
 * So the measurement runs where the problem is, on the server that served this
 * page, and reports them apart.
 */
export default function SpeedSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <section>
        <h2 style={heading}>Where the time goes</h2>
        <p style={blurb}>
          Run this from the deployment that feels slow — the numbers are about the server answering
          this request, so a check run locally says nothing about the live site. Nothing here writes;
          it reads what the hub already reads and times it.
        </p>
        <SpeedDiagnostics />
      </section>
    </SettingsDetail>
  )
}
