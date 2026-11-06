import { MemberHubSettings } from '@/components/portal/MemberHubSettings'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('member-hub')!

export default function MemberHubSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <MemberHubSettings />
    </SettingsDetail>
  )
}
