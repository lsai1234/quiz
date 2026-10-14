import {
  addDays, clockFace, describeDeadline, isIsoDate, londonDate, londonEndOfDay, timeLeft, wordsLeft,
} from '../deadline'

/**
 * The deadline a store code ends at, and how the countdown says it.
 *
 * The clock-change nights are the cases worth asserting: "tonight at midnight"
 * has to be London's midnight in October as well as in July, or a code ends an
 * hour before or after the countdown at checkout says it does.
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

describe('the countdown', () => {
  const end = new Date('2026-10-13T23:00:00Z')

  it('ticks in seconds inside a day', () => {
    const t = timeLeft(end, new Date('2026-10-13T18:47:27Z'))
    expect(clockFace(t)).toBe('04:12:33')
    expect(wordsLeft(t)).toBe('4h 12m')
  })

  it('counts days beyond one, without the seconds', () => {
    const t = timeLeft(end, new Date('2026-10-11T19:00:00Z'))
    expect(clockFace(t)).toBe('2d 04h')
    expect(wordsLeft(t)).toBe('2 days')
  })

  it('stops at zero rather than going negative', () => {
    const t = timeLeft(end, new Date('2026-10-14T01:00:00Z'))
    expect(t.ms).toBe(0)
    expect(clockFace(t)).toBe('00:00:00')
  })
})
