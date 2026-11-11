import type { Metadata } from 'next'
import { getOfferSettings } from '@/lib/offer/store'
import { memberHubTerms } from '@/lib/offer/terms'
import { effectiveTopUpFreeOver, hubOnSale } from '@/lib/offer/settings'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'

/** The member hub's terms: access, member prices, emails. Linked from the hub card and the hub. */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Member hub terms — CHRGD',
  robots: { index: false, follow: true },
}

export default async function MemberHubTermsPage() {
  const settings = await getOfferSettings()
  const sections = memberHubTerms({ freeOver: effectiveTopUpFreeOver(settings.memberDeals, getPricingConfig().freeDeliveryThreshold), hubPlan: hubOnSale(settings) ? { monthly: settings.hubPrice.monthly } : null })
  return (
    <main className="min-h-screen px-5 py-10" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-black tracking-tight mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
          Member hub terms
        </h1>
        <div className="text-sm leading-relaxed" style={{ color: 'var(--color-text-2)' }} data-member-hub-terms>
          {sections.map((s) => (
            <section key={s.heading} className="mb-6">
              <h2 className="text-sm font-black mb-1" style={{ color: 'var(--color-text)' }}>{s.heading}</h2>
              {s.lines.map((line) => (
                <p key={line} className="mb-2">{line}</p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
