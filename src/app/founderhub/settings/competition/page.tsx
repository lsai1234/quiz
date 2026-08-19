import { CompetitionSettings } from '@/components/portal/CompetitionSettings'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('competition')!

export default function CompetitionSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <section>
        <p
          style={{
            fontSize: 'var(--text-meta)',
            lineHeight: 'var(--leading-snug)',
            color: 'var(--ink-3)',
            marginBottom: 'var(--space-3)',
          }}
        >
          Off by default; <strong>Test</strong> runs the whole flow as a rehearsal. Going live needs
          the wording a prize draw legally has to carry, and this screen will not let it until every
          field is filled in.
        </p>
        <CompetitionSettings />
      </section>
    </SettingsDetail>
  )
}
