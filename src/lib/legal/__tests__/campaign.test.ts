/**
 * The re-consent campaign.
 *
 * The population that matters is the one the settlement can never be charged
 * to: members who accepted terms saying cancelling was free. Until they accept
 * a version that discloses a balance, their exit costs nothing whatever the
 * arithmetic says — so `preSettlement` is the number that decides what this
 * feature is actually worth, and the report exists to show it.
 */
import { campaignReport, noticeFor, standingOf } from '@/lib/legal/campaign'
import { SETTLEMENT_TERMS_VERSION, TERMS_VERSION } from '@/lib/legal/content'

const OLD = '2026-07-01'
const member = (id: string, versions: string[]) => ({ userId: id, email: `${id}@x.com`, acceptedTermsVersions: versions })

describe('where a member stands', () => {
  it('is current when they have accepted the latest', () => {
    expect(standingOf(member('a', [TERMS_VERSION]))).toBe('current')
  })

  it('is pre-settlement when everything they accepted predates the gate', () => {
    // The one that costs money: their exit is free, and no arithmetic changes it.
    expect(standingOf(member('b', [OLD]))).toBe('pre-settlement')
  })

  it('is none when there is no consent on file at all', () => {
    expect(standingOf(member('c', []))).toBe('none')
  })

  it('reads a settlement-disclosing version as covered even if a later edit exists', () => {
    // Versions are ISO dates, so "at or after the gate" is the right test — a
    // member who accepted the settlement terms is covered by them whether or not
    // they have seen a subsequent tidy-up.
    expect(standingOf(member('d', [SETTLEMENT_TERMS_VERSION]), '2099-01-01')).toBe('covered-but-stale')
  })

  it('counts the newest version a member has ever accepted, not the first', () => {
    expect(standingOf(member('e', [OLD, TERMS_VERSION]))).toBe('current')
  })
})

describe('the report', () => {
  const report = campaignReport([
    member('a', [TERMS_VERSION]),
    member('b', [OLD]),
    member('c', []),
    member('d', [OLD]),
  ])

  it('counts who the settlement can never apply to', () => {
    expect(report.preSettlement).toBe(2)
    expect(report.none).toBe(1)
    // Three of four members exit free today. That is the campaign's whole point.
    expect(report.uncoveredShare).toBe(0.75)
  })

  it('counts the ones already covered', () => {
    expect(report.current).toBe(1)
    expect(report.total).toBe(4)
  })

  it('handles an empty base without dividing by zero', () => {
    expect(campaignReport([]).uncoveredShare).toBe(0)
  })
})

describe('what we say to them', () => {
  it('says nothing to a member who is already current', () => {
    expect(noticeFor('current')).toBeNull()
  })

  it('tells a pre-settlement member the new term plainly, and that they may decline', () => {
    const notice = noticeFor('pre-settlement')!
    const prose = notice.body.join(' ')
    expect(prose).toContain('settle the balance')
    // Not a cancellation fee — the distinction the whole thing rests on.
    expect(prose).toContain('not a cancellation fee')
    // The concessions, because an ask that only lists obligations is a bad ask.
    expect(prose).toContain('capped at what you have already paid')
    expect(prose).toContain('under £5 is waived')
    // And the way out.
    expect(prose).toContain('You do not have to accept')
  })

  it('treats a stale-but-covered member as a smaller ask', () => {
    const notice = noticeFor('covered-but-stale')!
    const prose = notice.body.join(' ')
    expect(notice.headline).toMatch(/tidied/i)
    // Leads with what got better, then names the correction rather than burying it.
    expect(prose).toContain('in your favour')
    expect(prose).toContain('rises again')
  })
})
