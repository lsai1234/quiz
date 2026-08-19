import { DataSourceToggle } from '@/components/portal/DataSourceToggle'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('catalogue')!

export default function CatalogueSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <section>
        <DataSourceToggle />
      </section>
    </SettingsDetail>
  )
}
