import { OfferSettings } from '@/components/portal/OfferSettings'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('offer')!

export default function OfferSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <OfferSettings />
    </SettingsDetail>
  )
}
