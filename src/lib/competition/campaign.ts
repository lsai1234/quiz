import { kvGet, kvSet } from '@/lib/db/kv'

/**
 * The competition, as configured.
 *
 * ── Why this is a settings record and not a constant ────────────────────────
 * "Follow, repost, share to your story, win up to £200" is a prize draw under
 * the CAP Code, and a prize draw needs things a constant cannot carry: a closing
 * date, a promoter's name and address, how winners are picked and notified, and
 * a free entry route of equal standing. None of that is written yet — so it
 * lives here, editable from the Founders Hub, and the mechanics are built around
 * the shape of it rather than waiting for the words.
 *
 * ── `status` is the switch that matters ─────────────────────────────────────
 *   `off`   — nothing about a competition appears anywhere. The default.
 *   `test`  — the whole flow runs, visibly marked as a test, and entries are
 *             recorded as test rows. This is what "we just want to try it" is.
 *   `live`  — a real promotion, and `readyToGoLive()` is what stops it becoming
 *             one before the wording exists.
 *
 * ── The closing date is read live, never from a card ────────────────────────
 * `docs/SHARE_CARD_BLUEPRINT.md` §3.7: a payload is a frozen snapshot, but a
 * promotion that keeps advertising itself after it has closed is a compliance
 * problem rather than a stale card. So the entry card asks `competitionState()`
 * at render time and stops carrying the band once the date passes.
 */

const KEY = 'competition:campaign'

export type CampaignStatus = 'off' | 'test' | 'live'

export interface Campaign {
  status: CampaignStatus
  /** Shown on the card and the entry screen. */
  name: string
  /** The prize, in the words it is advertised in. */
  prize: string
  /** ISO date. Entries after this are refused and the band stops rendering. */
  closesAt: string | null
  /** What somebody has to do. Shown as the mechanic on the entry screen. */
  mechanic: string
  /** CAP: the promoter has to be identifiable on the promotion. */
  promoterName: string
  promoterAddress: string
  /** CAP: how and when winners are chosen, and what happens if unreachable. */
  winnerSelection: string
  /** CAP: a no-purchase-necessary route of equal standing. */
  freeEntryRoute: string
  /** Where the full terms live. Relative or absolute. */
  termsUrl: string
  /**
   * The Instagram handle, on the card.
   *
   * This is the field the whole entry card turns on. A story someone reshares is
   * a flat image — there is no link on it, and the person seeing it has no way to
   * reach the quiz unless the picture tells them where to go. So the handle and
   * the route below are printed on the card, large, and they are the only path
   * from a repost back to us.
   */
  instagramHandle: string
  /** How to reach the quiz from the handle — "Quiz link in bio". */
  quizRoute: string
  /**
   * The three steps, as they appear on the card.
   *
   * Discrete rather than a sentence, because the card is an advert and an advert
   * that needs reading twice does not get entered. `mechanic` stays as the prose
   * version for the terms page.
   */
  entrySteps: string[]
  /** Instagram requires the promotion to disclaim their involvement. */
  platformDisclaimer: string
}

export const EMPTY_CAMPAIGN: Campaign = {
  status: 'off',
  name: '',
  prize: '',
  closesAt: null,
  mechanic: '',
  promoterName: '',
  promoterAddress: '',
  winnerSelection: '',
  freeEntryRoute: '',
  termsUrl: '/legal/competition',
  instagramHandle: '@getchrgd_',
  quizRoute: 'Quiz link in our bio',
  entrySteps: [
    'Follow @getchrgd_',
    'Take the quiz and share your stack',
    'Tag @getchrgd_ in your story',
  ],
  platformDisclaimer:
    'This promotion is in no way sponsored, endorsed or administered by, or associated with, Instagram or TikTok.',
}

export async function getCampaign(): Promise<Campaign> {
  const stored = await kvGet<Partial<Campaign>>(KEY)
  return { ...EMPTY_CAMPAIGN, ...(stored ?? {}) }
}

export async function saveCampaign(patch: Partial<Campaign>): Promise<Campaign> {
  const next = { ...(await getCampaign()), ...patch }
  await kvSet(KEY, next)
  return next
}

/**
 * The fields a live promotion cannot be without.
 *
 * Not a style guide — every one of these is something the CAP Code requires to
 * appear on or with the promotion. Returned as a list so the Founders Hub can
 * show exactly what is missing rather than a flat "not ready".
 */
export const REQUIRED_FOR_LIVE: Array<{ field: keyof Campaign; label: string }> = [
  { field: 'name', label: 'A name for the promotion' },
  { field: 'prize', label: 'What the prize actually is' },
  { field: 'closesAt', label: 'A closing date' },
  { field: 'mechanic', label: 'What somebody has to do to enter' },
  { field: 'promoterName', label: 'Promoter name' },
  { field: 'promoterAddress', label: 'Promoter address' },
  { field: 'winnerSelection', label: 'How and when winners are picked and notified' },
  { field: 'freeEntryRoute', label: 'A free entry route (no purchase necessary)' },
  { field: 'termsUrl', label: 'A link to the full terms' },
  { field: 'instagramHandle', label: 'The Instagram handle to print on the card' },
  { field: 'quizRoute', label: 'How someone reaches the quiz from that handle' },
]

/** What is still missing before this may be set to `live`. Empty = ready. */
export function missingForLive(campaign: Campaign): string[] {
  return REQUIRED_FOR_LIVE.filter(({ field }) => {
    const value = campaign[field]
    return typeof value !== 'string' || value.trim().length === 0
  }).map(({ label }) => label)
}

export function readyToGoLive(campaign: Campaign): boolean {
  return missingForLive(campaign).length === 0
}

export type CompetitionState = 'off' | 'open' | 'closed'

/**
 * Whether the competition is currently running.
 *
 * `closed` rather than `off` once the date passes, so the entry screen can say
 * "this has closed" instead of pretending there was never a promotion — which is
 * what somebody arriving from an old story deserves to be told.
 */
export function competitionState(campaign: Campaign, now: Date = new Date()): CompetitionState {
  if (campaign.status === 'off') return 'off'
  if (campaign.status === 'live' && !readyToGoLive(campaign)) return 'off'
  if (!campaign.closesAt) return campaign.status === 'test' ? 'open' : 'off'
  return new Date(campaign.closesAt).getTime() >= now.getTime() ? 'open' : 'closed'
}

/** True while this is a rehearsal — everything visible says so. */
export function isTestRun(campaign: Campaign): boolean {
  return campaign.status === 'test'
}
