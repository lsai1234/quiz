import { GoLiveSettings } from '@/components/portal/GoLiveSettings'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('go-live')!

export default function GoLiveSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <GoLiveSettings />
    </SettingsDetail>
  )
}
