import { MemberFeedbackInbox } from '@/components/portal/MemberFeedbackInbox'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('member-feedback')!

export default function MemberFeedbackSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <MemberFeedbackInbox />
    </SettingsDetail>
  )
}
