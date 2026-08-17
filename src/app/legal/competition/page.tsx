import type { Metadata } from 'next'
import { getCampaign, competitionState, isTestRun } from '@/lib/competition/campaign'
import { FreeEntryForm } from '@/components/share-card/FreeEntryForm'

/**
 * The competition page — terms, and the free entry route.
 *
 * ── Why the free route lives here and not behind an email address ───────────
 * The CAP Code requires a no-purchase-necessary route of **equal standing**. A
 * free entry that means finding an address and composing an email is not equal
 * to one that means tapping a button in the share sheet, so it is the same form,
 * on the page every card links to.
 *
 * ── Why every field renders from config ─────────────────────────────────────
 * Nothing on this page is written in the code. A promotion's significant
 * conditions are the promoter's words and they change per campaign — the Founders
 * Hub holds them, and this page refuses to pretend there is a promotion when
 * they are empty.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const campaign = await getCampaign()
  const state = competitionState(campaign)
  return {
    title: state === 'off' ? 'Competition — CHRGD' : `${campaign.name} — CHRGD`,
    robots: { index: state === 'open', follow: true },
  }
}

const section = 'mb-6'
const h2 = 'text-sm font-black mb-1'

export default async function CompetitionPage() {
  const campaign = await getCampaign()
  const state = competitionState(campaign)
  const test = isTestRun(campaign)

  return (
    <main className="min-h-screen px-5 py-10" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-lg mx-auto">
        {test && (
          <p
            className="text-[11px] font-bold mb-4 px-3 py-2 rounded-xl"
            style={{ color: '#fbbf24', background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.3)' }}
          >
            TEST RUN — this is a rehearsal. Nothing here is a live promotion and no prize is being offered.
          </p>
        )}

        <h1
          className="text-2xl font-black tracking-tight mb-2"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text)' }}
        >
          {state === 'off' ? 'No competition is running' : campaign.name || 'Competition'}
        </h1>

        {state === 'off' && (
          <p className="text-sm" style={{ color: 'var(--color-text-2)' }}>
            There isn’t a giveaway on at the moment. When there is, the terms will be here.
          </p>
        )}

        {state === 'closed' && (
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-2)' }}>
            This promotion has closed. Entries are no longer being accepted.
          </p>
        )}

        {state !== 'off' && (
          <div className="text-sm leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
            <div className={section}>
              <h2 className={h2} style={{ color: 'var(--color-text)' }}>Prize</h2>
              <p>{campaign.prize}</p>
            </div>

            <div className={section}>
              <h2 className={h2} style={{ color: 'var(--color-text)' }}>How to enter</h2>
              <p>{campaign.mechanic}</p>
            </div>

            <div className={section}>
              <h2 className={h2} style={{ color: 'var(--color-text)' }}>Closing date</h2>
              <p>
                {campaign.closesAt
                  ? new Date(campaign.closesAt).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })
                  : 'To be confirmed.'}
              </p>
            </div>

            <div className={section}>
              <h2 className={h2} style={{ color: 'var(--color-text)' }}>How winners are picked</h2>
              <p>{campaign.winnerSelection}</p>
            </div>

            <div className={section}>
              <h2 className={h2} style={{ color: 'var(--color-text)' }}>Free entry — no purchase necessary</h2>
              <p className="mb-3">{campaign.freeEntryRoute}</p>
              {state === 'open' && <FreeEntryForm test={test} />}
            </div>

            <div className={section}>
              <h2 className={h2} style={{ color: 'var(--color-text)' }}>Promoter</h2>
              <p>{campaign.promoterName}</p>
              <p className="whitespace-pre-line">{campaign.promoterAddress}</p>
            </div>

            <p className="text-xs mt-8" style={{ color: 'var(--color-muted)' }}>
              {campaign.platformDisclaimer}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
