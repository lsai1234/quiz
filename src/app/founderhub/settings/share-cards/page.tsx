import { ShareArtSettings } from '@/components/portal/ShareArtSettings'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('share-cards')!

export default function ShareCardSettingsPage() {
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
          One photograph per category, printed full-bleed behind the stack on every share card. The
          preview shows the crop the card actually uses, not the whole picture — the bottom fifth is
          cut off — and the guide marks where the charge index is ghosted over the frame.
        </p>
        <ShareArtSettings />
      </section>
    </SettingsDetail>
  )
}
