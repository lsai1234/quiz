import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'
import { TestViews } from '@/components/portal/TestViews'

const SECTION = sectionBySlug('test-views')!

export default function TestViewsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <TestViews />
    </SettingsDetail>
  )
}
