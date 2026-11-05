import { TrainingSettings } from '@/components/portal/TrainingSettings'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('training')!

export default function TrainingSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <TrainingSettings />
    </SettingsDetail>
  )
}
