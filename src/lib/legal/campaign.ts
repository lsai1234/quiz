/**
 * The re-consent campaign.
 *
 * `SETTLEMENT_TERMS_VERSION` is a gate: a member who accepted the earlier terms
 * was told cancelling was free, and we do not get to charge them a balance they
 * were never shown. That is correct and it has a consequence nobody enjoys —
 * **until a member re-consents, their exit costs nothing**, so the whole
 * settlement feature applies to precisely the people who signed up after the
 * terms moved and to nobody else.
 *
 * A campaign is how that population shrinks. It is not a dark pattern and must
 * not become one: the ask is legitimate (the terms genuinely changed, and one
 * part of the change is a correction rather than a concession), the deadline is
 * about when the NEW terms start applying to them, and refusing has a real,
 * stated outcome — they carry on under the old ones. Nothing is withheld and
 * nothing stops working.
 *
 * Pure. The caller reads the members and their consent state.
 */
import { SETTLEMENT_TERMS_VERSION, TERMS_VERSION } from './content'

/** Where a member stands with the current terms. */
export type ConsentStanding =
  /** Accepted the current version. Nothing to do. */
  | 'current'
  /** Has accepted terms that disclose the settlement, but not the latest edit. */
  | 'covered-but-stale'
  /** Never accepted a settlement-disclosing version — exits are free for them. */
  | 'pre-settlement'
  /** No consent on file at all. */
  | 'none'

export interface MemberConsent {
  userId: string
  email: string | null
  /** Every terms version this member has ever accepted. */
  acceptedTermsVersions: string[]
}

export function standingOf(
  member: MemberConsent,
  termsVersion = TERMS_VERSION,
  settlementVersion = SETTLEMENT_TERMS_VERSION,
): ConsentStanding {
  if (member.acceptedTermsVersions.length === 0) return 'none'
  if (member.acceptedTermsVersions.includes(termsVersion)) return 'current'
  // Versions are ISO dates, so string comparison is chronological.
  const covered = member.acceptedTermsVersions.some((v) => v >= settlementVersion)
  return covered ? 'covered-but-stale' : 'pre-settlement'
}

export interface CampaignReport {
  total: number
  current: number
  coveredButStale: number
  /** The population the settlement cannot be charged to. The number that matters. */
  preSettlement: number
  none: number
  /** Share of members whose exits are currently free, 0–1. */
  uncoveredShare: number
  members: { userId: string; email: string | null; standing: ConsentStanding }[]
}

/**
 * Who has accepted what.
 *
 * `preSettlement` + `none` is the number to watch: it is how much of the member
 * base the exit settlement can never apply to, and therefore what the campaign
 * is worth. A founder deciding whether this feature earns its keep needs that
 * figure more than any of the others.
 */
export function campaignReport(
  members: MemberConsent[],
  termsVersion = TERMS_VERSION,
  settlementVersion = SETTLEMENT_TERMS_VERSION,
): CampaignReport {
  const rows = members.map((m) => ({
    userId: m.userId,
    email: m.email,
    standing: standingOf(m, termsVersion, settlementVersion),
  }))
  const count = (s: ConsentStanding) => rows.filter((r) => r.standing === s).length
  const uncovered = count('pre-settlement') + count('none')

  return {
    total: rows.length,
    current: count('current'),
    coveredButStale: count('covered-but-stale'),
    preSettlement: count('pre-settlement'),
    none: count('none'),
    uncoveredShare: rows.length === 0 ? 0 : Math.round((uncovered / rows.length) * 1000) / 1000,
    members: rows,
  }
}

/**
 * What to tell a member, and how firmly.
 *
 * Two different asks wearing one word. Someone who has never accepted terms that
 * disclose the settlement is being asked to accept a genuinely new commercial
 * term, and is entitled to a plain statement of what changes and the option to
 * do nothing. Someone who accepted a settlement-disclosing version and has since
 * fallen behind an edit is being asked to acknowledge a correction, which is a
 * smaller thing and should read like one.
 *
 * Neither is blocking. A notice that stops someone using a service they are
 * paying for, over terms they are allowed to decline, is coercion dressed as
 * compliance.
 */
export function noticeFor(standing: ConsentStanding): { headline: string; body: string[] } | null {
  if (standing === 'current') return null

  if (standing === 'covered-but-stale') {
    return {
      headline: 'We’ve tidied up our terms',
      body: [
        'Mostly in your favour: the balance you settle if you leave early is now capped at what you have already paid us, anything under £5 is waived entirely, and a first-month discount is no longer taken back when you go.',
        'One correction too: that balance goes down as your payments catch up, but it rises again each time a new multi-month item arrives. We used to only mention the first half of that.',
      ],
    }
  }

  return {
    headline: 'Our subscription terms have changed',
    body: [
      'If you cancel early, you now settle the balance on anything already sent to you that your payments have not yet covered. It is not a cancellation fee — there is still no minimum term, and you keep everything we have sent.',
      'It is capped at what you have already paid us, anything under £5 is waived, and we will always show you the exact figure and the next date it would be nothing at all before you confirm.',
      'You do not have to accept. If you would rather not, nothing changes and your current terms carry on as they are.',
    ],
  }
}
