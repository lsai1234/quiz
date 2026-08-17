import { getCampaign, competitionState, isTestRun } from './campaign'
import type { CompetitionBand } from '@/lib/share-card/format'

/**
 * The campaign, in the shape the card renders.
 *
 * Read at render time and never from a payload. `docs/SHARE_CARD_BLUEPRINT.md`
 * §3.7: a card is a frozen snapshot, but a promotion that keeps advertising
 * itself after it has closed is a compliance problem rather than a stale card.
 * So this asks the live record every time, and returns null the moment the
 * closing date passes — the entry card stops being an advert and the band stops
 * appearing.
 *
 * Server-only.
 */
export async function competitionBand(): Promise<CompetitionBand | null> {
  const campaign = await getCampaign()
  if (competitionState(campaign) !== 'open') return null

  return {
    prize: campaign.prize || 'A free stack',
    mechanic: campaign.mechanic || 'Share this to your story',
    closes: campaign.closesAt
      ? `Closes ${new Date(campaign.closesAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
      : 'Closing date to be confirmed',
    terms: campaign.termsUrl.replace(/^https?:\/\//, ''),
    test: isTestRun(campaign),
    handle: campaign.instagramHandle || '@getchrgd',
    route: campaign.quizRoute || 'Quiz link in our bio',
    steps: campaign.entrySteps.filter(Boolean),
  }
}
