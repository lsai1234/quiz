/**
 * A snooze that has run its course.
 *
 * The hub tells a member "Back on 14 March — nothing billed until then", and
 * until now nothing made that true: `resumeSubscription` was only reached by the
 * member pressing the button themselves, the daily job never looked, and
 * Stripe's pause carried no `resumes_at`. A three-month snooze stayed paused
 * indefinitely with a date on screen that came and went.
 */
import { snoozeHasExpired } from '@/lib/recharge/resume'
import { snoozeSubscription, pauseSubscription } from '@/lib/recharge/mock'
import type { MemberSubscription } from '@/lib/recharge/types'

const plan = (over: Partial<MemberSubscription> = {}): MemberSubscription =>
  ({ id: 's1', status: 'active', flatMonthly: 30, monthsActive: 0, lines: [], ...over }) as MemberSubscription

describe('snoozing', () => {
  it('is capped at three months however many are asked for', () => {
    expect(snoozeSubscription(plan(), 12).snoozedMonths).toBe(3)
    expect(snoozeSubscription(plan(), 0).snoozedMonths).toBe(1)
  })

  it('records a return date', () => {
    const snoozed = snoozeSubscription(plan(), 2)
    expect(snoozed.status).toBe('paused')
    expect(new Date(snoozed.snoozeUntil!).getTime()).toBeGreaterThan(Date.now())
  })
})

describe('whether a snooze has run out', () => {
  const past = '2026-01-01T00:00:00.000Z'
  const future = '2027-01-01T00:00:00.000Z'
  const now = new Date('2026-06-01T00:00:00.000Z')

  it('is true once the return date has passed', () => {
    expect(snoozeHasExpired(plan({ status: 'paused', snoozeUntil: past }), now)).toBe(true)
  })

  it('is false before it', () => {
    expect(snoozeHasExpired(plan({ status: 'paused', snoozeUntil: future }), now)).toBe(false)
  })

  it('never fires for an open-ended pause', () => {
    // A pause without a date is a member's own choice with no promise attached,
    // so it waits for them rather than being resumed under them.
    const paused = pauseSubscription(plan())
    expect(paused.snoozeUntil).toBeUndefined()
    expect(snoozeHasExpired(paused, now)).toBe(false)
  })

  it('never fires for an active or cancelled plan', () => {
    expect(snoozeHasExpired(plan({ status: 'active', snoozeUntil: past }), now)).toBe(false)
    expect(snoozeHasExpired(plan({ status: 'cancelled', snoozeUntil: past } as Partial<MemberSubscription>), now)).toBe(false)
  })

  it('ignores a date it cannot read rather than resuming on a guess', () => {
    expect(snoozeHasExpired(plan({ status: 'paused', snoozeUntil: 'not a date' }), now)).toBe(false)
  })
})
