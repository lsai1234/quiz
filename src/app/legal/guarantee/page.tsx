import type { Metadata } from 'next'
import { getOfferSettings } from '@/lib/offer/store'
import { guaranteeTerms } from '@/lib/offer/terms'

/**
 * The first-box guarantee's terms (Option 1), linked from beside every place
 * the guarantee is said. Says so when the guarantee isn't running.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'First-box guarantee terms — CHRGD',
  robots: { index: false, follow: true },
}

export default async function GuaranteeTermsPage() {
  const { services } = await getOfferSettings()
  const sections = guaranteeTerms()
  return (
    <main className="min-h-screen px-5 py-10" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-lg mx-auto">
        {!services.guarantee && (
          <p className="text-[11px] font-bold mb-4 px-3 py-2 rounded-xl" style={{ color: 'var(--color-text)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
            The first-box guarantee isn’t running at the moment. When it is, these are its terms.
          </p>
        )}
        <h1 className="text-2xl font-black tracking-tight mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
          First-box guarantee terms
        </h1>
        <div className="text-sm leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
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
