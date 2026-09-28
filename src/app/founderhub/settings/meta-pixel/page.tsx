import { MetaPixelSettings } from '@/components/portal/MetaPixelSettings'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('meta-pixel')!

export default function MetaPixelSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <section>
        <MetaPixelSettings />
      </section>
    </SettingsDetail>
  )
}
