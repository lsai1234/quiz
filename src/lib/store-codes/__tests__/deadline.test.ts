import {
  addDays, describeDeadline, isIsoDate, londonDate, londonEndOfDay, validUntil,
} from '../deadline'

/**
 * The deadline a store code ends at, and how the hub and the checkout card say it.
 *
 * The clock-change nights are the cases worth asserting: "tonight at midnight"
 * has to be London's midnight in October as well as in July, or a code ends an
 * hour before or after the day the checkout card says it is valid until.
 */

describe('the London day', () => {
  it('reads the date in London, not UTC', () => {
    // 23:30 UTC in summer is already tomorrow in London.
    expect(londonDate(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02')
    expect(londonDate(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-01')
  })

  it('moves dates by calendar days', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('knows a real date from a malformed one', () => {
    expect(isIsoDate('2026-10-13')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('13/10/2026')).toBe(false)
    expect(isIsoDate(null)).toBe(false)
  })
})

describe('the end of a day', () => {
  it('is London midnight in summer and in winter', () => {
    expect(londonEndOfDay('2026-07-14').toISOString()).toBe('2026-07-14T23:00:00.000Z')
    expect(londonEndOfDay('2026-12-14').toISOString()).toBe('2026-12-15T00:00:00.000Z')
  })

  it('is right on both nights the clocks change', () => {
    // BST ends 01:00 UTC Sun 25 Oct 2026: Saturday still ends on BST.
    expect(londonEndOfDay('2026-10-24').toISOString()).toBe('2026-10-24T23:00:00.000Z')
    expect(londonEndOfDay('2026-10-25').toISOString()).toBe('2026-10-26T00:00:00.000Z')
    // BST starts 01:00 UTC Sun 29 Mar 2026: Saturday ends on GMT.
    expect(londonEndOfDay('2026-03-28').toISOString()).toBe('2026-03-29T00:00:00.000Z')
    expect(londonEndOfDay('2026-03-29').toISOString()).toBe('2026-03-29T23:00:00.000Z')
  })
})

describe('saying when', () => {
  const now = new Date('2026-10-13T15:00:00Z') // Tue 13 Oct, 16:00 in London

  it('calls today’s midnight tonight, all day', () => {
    expect(describeDeadline(londonEndOfDay('2026-10-13'), now)).toBe('tonight at midnight')
    // Five minutes to midnight it is still tonight, not tomorrow.
    expect(describeDeadline(londonEndOfDay('2026-10-13'), new Date('2026-10-13T22:55:00Z'))).toBe('tonight at midnight')
  })

  it('names tomorrow, then the day', () => {
    expect(describeDeadline(londonEndOfDay('2026-10-14'), now)).toBe('tomorrow at midnight')
    expect(describeDeadline(londonEndOfDay('2026-10-18'), now)).toBe('Sun 18 Oct at midnight')
  })

  it('gives the time for an end that is not a midnight', () => {
    expect(describeDeadline('2026-10-13T17:00:00Z', now)).toBe('today at 18:00')
  })
})

describe('saying until when', () => {
  it('names the day a midnight end closes, and never “tonight”', () => {
    expect(validUntil(londonEndOfDay('2026-10-28'))).toBe('Wed 28 Oct')
    // Today's end is a date too: nothing about how soon it is.
    expect(validUntil(londonEndOfDay('2026-10-13'))).toBe('Tue 13 Oct')
  })

  it('is the right day either side of the clocks going back', () => {
    // Saturday ends at 23:00 UTC on BST, Sunday at 00:00 UTC on GMT.
    expect(validUntil(londonEndOfDay('2026-10-24'))).toBe('Sat 24 Oct')
    expect(validUntil(londonEndOfDay('2026-10-25'))).toBe('Sun 25 Oct')
  })

  it('gives the time for an end that is not a midnight', () => {
    expect(validUntil('2026-10-13T17:00:00Z')).toBe('18:00 on Tue 13 Oct')
  })
})
