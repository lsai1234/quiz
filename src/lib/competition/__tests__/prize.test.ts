import { prizeAmount, prizeChip, closesLabel } from '../prize'

/**
 * The prize, cut down to chip size.
 *
 * `prize` is a sentence somebody types in Founders Hub, so this has to survive
 * whatever they write — including a prize that has no figure in it at all, where
 * inventing one would be a claim about what is being given away.
 */

describe('prizeAmount', () => {
  it('finds the figure in a sentence', () => {
    expect(prizeAmount('Win £200 of supplements')).toBe('£200')
    expect(prizeAmount('£1,000 of free product')).toBe('£1,000')
    expect(prizeAmount('Up to $50 to spend')).toBe('$50')
  })

  it('closes the gap when the amount is written with a space', () => {
    expect(prizeAmount('Win £ 200 of supplements')).toBe('£200')
  })

  it('has no answer when there is no figure', () => {
    expect(prizeAmount('A year’s supply')).toBeNull()
    expect(prizeAmount('')).toBeNull()
  })
})

describe('prizeChip', () => {
  it('is the money, when there is money', () => {
    expect(prizeChip('Win £200 of supplements')).toBe('Win £200')
  })

  it('falls back rather than inventing a figure', () => {
    // "Win a year's supply" does not fit a chip either, and a number that was
    // never written down is a claim about the prize.
    expect(prizeChip('A year’s supply')).toBe('Enter')
  })
})

describe('closesLabel', () => {
  it('reads as a date somebody would say out loud', () => {
    expect(closesLabel('2026-11-30T23:59:00.000Z')).toBe('Closes 30 Nov')
  })

  it('says nothing rather than something wrong', () => {
    expect(closesLabel(null)).toBe('')
    expect(closesLabel('not a date')).toBe('')
  })
})
