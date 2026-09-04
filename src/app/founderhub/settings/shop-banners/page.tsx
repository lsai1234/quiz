import { ShopBannerSettings } from '@/components/portal/ShopBannerSettings'
import { SettingsDetail, sectionBySlug } from '@/components/portal/SettingsNav'

const SECTION = sectionBySlug('shop-banners')!

export default function ShopBannerSettingsPage() {
  return (
    <SettingsDetail section={SECTION}>
      <section>
        <p
          style={{
            fontSize: 'var(--text-meta)',
            lineHeight: 'var(--leading-snug)',
            color: 'var(--ink-3)',
            marginBottom: 'var(--space-3)',
          }}
        >
          The artwork at the top of the shop. The headline and subhead are drawn over the picture as
          live text rather than baked into it, so an offer can change without regenerating anything —
          and so a screen reader gets words. Leave the left of the frame quiet: that is where they go.
          With no banners uploaded the shop falls back to one built from product photography.
        </p>
        <ShopBannerSettings />
      </section>
    </SettingsDetail>
  )
}
