import { generateShareToken, normaliseToken, isShareToken, TOKEN_LENGTH } from '../token'

/**
 * Share tokens end up somewhere most identifiers never go: printed on an image
 * that people photograph, screenshot and read back to each other. So the
 * assertions here are about a human retyping one, not only about collisions.
 */
describe('generateShareToken', () => {
  it('is ten characters of the readable alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const token = generateShareToken()
      expect(token).toHaveLength(TOKEN_LENGTH)
      expect(token).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/)
    }
  })

  it('never emits the characters people misread', () => {
    // I/L against 1, O against 0, and U for the reason Crockford excludes it —
    // this token gets printed on something posted in public.
    const sample = Array.from({ length: 400 }, () => generateShareToken()).join('')
    expect(sample).not.toMatch(/[ILOU]/)
  })

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateShareToken()))
    expect(seen.size).toBe(2000)
  })

  it('spreads across the alphabet', () => {
    // A modulo-biased generator still passes every test above. This one fails if
    // the first eight symbols start showing up appreciably more often than the
    // rest: 20,000 symbols over 32 slots averages 625 each.
    const counts = new Map<string, number>()
    for (const c of Array.from({ length: 2000 }, () => generateShareToken()).join('')) {
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    expect(counts.size).toBe(32)
    expect(Math.min(...counts.values())).toBeGreaterThan(450)
    expect(Math.max(...counts.values())).toBeLessThan(850)
  })
})

describe('normaliseToken', () => {
  it('accepts a token as generated', () => {
    const token = generateShareToken()
    expect(normaliseToken(token)).toBe(token)
  })

  it('forgives the way people type a code off a screenshot', () => {
    expect(normaliseToken('ab12cd7x9k')).toBe('AB12CD7X9K')
    expect(normaliseToken('  AB12CD7X9K  ')).toBe('AB12CD7X9K')
    expect(normaliseToken('AB12C-D7X9K')).toBe('AB12CD7X9K')
    expect(normaliseToken('AB12C D7X9K')).toBe('AB12CD7X9K')
  })

  it('folds the confusable characters onto what was meant', () => {
    // Someone reading "AB12CD7X9K" off a story and typing O for 0.
    expect(normaliseToken('OB12CD7X9K')).toBe('0B12CD7X9K')
    expect(normaliseToken('IB12CD7X9K')).toBe('1B12CD7X9K')
    expect(normaliseToken('LB12CD7X9K')).toBe('1B12CD7X9K')
    expect(normaliseToken('UB12CD7X9K')).toBe('VB12CD7X9K')
  })

  it('rejects anything that is not a token', () => {
    expect(normaliseToken('')).toBeNull()
    expect(normaliseToken('TOOSHORT')).toBeNull()
    expect(normaliseToken('WAYTOOLONGFORATOKEN')).toBeNull()
    expect(normaliseToken('AB12CD7X9!')).toBeNull()
  })
})

describe('isShareToken', () => {
  it('is true only for the stored form', () => {
    const token = generateShareToken()
    expect(isShareToken(token)).toBe(true)
    expect(isShareToken(token.toLowerCase())).toBe(false)
    expect(isShareToken('AB12CD7X9')).toBe(false)
  })
})
