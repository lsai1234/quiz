import { FounderCodes } from '@/components/portal/FounderCodes'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('codes')!

export default function FounderCodesSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <section>
        <FounderCodes />
      </section>
    </SettingsDetail>
  )
}
