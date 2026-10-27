import type { Metadata } from 'next'
import { getOfferSettings } from '@/lib/offer/store'
import { freeGiftTerms } from '@/lib/offer/terms'

/**
 * The free gift's terms (plan Phase 4), linked from every place the results
 * page says "free" about the bonus. Built from the hub's settings
 * (`freeGiftTerms`), so the minimum and the depths here are the ones the
 * checkout applies. Says so when the gift isn't running.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Free gift terms — CHRGD',
  robots: { index: false, follow: true },
}

export default async function FreeGiftTermsPage() {
  const { bonus } = await getOfferSettings()
  const sections = freeGiftTerms(bonus)
  return (
    <main className="min-h-screen px-5 py-10" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-lg mx-auto">
        {!bonus.enabled && (
          <p className="text-[11px] font-bold mb-4 px-3 py-2 rounded-xl" style={{ color: 'var(--color-text)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
            The free gift isn’t running at the moment. When it is, these are its terms.
          </p>
        )}
        <h1 className="text-2xl font-black tracking-tight mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}>
          Free gift terms
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
