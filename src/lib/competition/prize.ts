/**
 * The prize, short enough to sit in a chip.
 *
 * `prize` is a sentence the founder types — "Win £200 of supplements" — which is
 * right on the card and far too long for a label next to a button. The amount is
 * the part that does the work, so it is pulled out of whatever was written
 * rather than stored as a second field nobody would keep in sync.
 *
 * Pure, and shared: the reveal page's chip and any future badge read the same
 * answer from the same sentence.
 */
const AMOUNT = /[£$€]\s?\d[\d,.]*[kK]?/

export function prizeAmount(prize: string): string | null {
  const match = AMOUNT.exec(prize ?? '')
  return match ? match[0].replace(/\s+/g, '') : null
}

/**
 * The chip's words.
 *
 * Falls back to "Enter" rather than inventing a figure: a prize with no amount
 * in it is a prize like "a year's supply", and "Win a year's supply" does not
 * fit a chip either.
 */
export function prizeChip(prize: string): string {
  const amount = prizeAmount(prize)
  return amount ? `Win ${amount}` : 'Enter'
}

/**
 * The prize, as it reads mid-sentence.
 *
 * `prize` is written to stand alone on the card — "Win £200 of supplements" —
 * which is right there and wrong inside a sentence: "count you in for Win £200
 * of supplements". The leading verb comes off so the noun can be used where a
 * noun belongs.
 */
export function prizeInline(prize: string): string {
  return (prize ?? '').trim().replace(/^(win|get|claim)\s+/i, '')
}

/** "Closes 30 Nov", from the stored ISO date. Empty when there is no date. */
export function closesLabel(closesAt: string | null | undefined): string {
  if (!closesAt) return ''
  const date = new Date(closesAt)
  if (Number.isNaN(date.getTime())) return ''
  return `Closes ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}
