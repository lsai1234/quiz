import { StoreCodes } from '@/components/portal/StoreCodes'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('discount-codes')!

export default function DiscountCodesSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <section>
        <StoreCodes />
      </section>
    </SettingsDetail>
  )
}
