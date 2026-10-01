import { NotificationSettings } from '@/components/portal/NotificationSettings'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('notifications')!

export default function NotificationSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <section>
        <NotificationSettings />
      </section>
    </SettingsDetail>
  )
}
