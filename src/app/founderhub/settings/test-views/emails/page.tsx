import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'
import { TestEmails } from '@/components/portal/TestEmails'

const SECTION = sectionBySlug('test-views')!

export default function TestEmailsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <TestEmails />
    </SettingsDetail>
  )
}
