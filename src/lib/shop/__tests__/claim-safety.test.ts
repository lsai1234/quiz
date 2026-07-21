import { claimFlags, isClaimSafe } from '../claim-safety'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'

describe('claimFlags', () => {
  it('flags proven / results / prevent / speeds up / cure / treat / guarantee', () => {
    expect(isClaimSafe('Proven to build strength — take it daily to see results.')).toBe(false)
    expect(isClaimSafe('Prevents cramps during long sessions.')).toBe(false)
    expect(isClaimSafe('Amino acids that speed up muscle repair.')).toBe(false)
    expect(isClaimSafe('Cures colds and treats the flu.')).toBe(false)
    expect(isClaimSafe('Results guaranteed or your money back.')).toBe(false)
  })
  it('reports what tripped and why', () => {
    const flags = claimFlags('Clinically proven to eliminate soreness.')
    const matches = flags.map((f) => f.match.toLowerCase())
    expect(matches).toContain('clinically proven')
    expect(matches).toContain('eliminate')
    expect(flags.every((f) => typeof f.why === 'string' && f.why.length > 0)).toBe(true)
  })
  it('allows accepted structure/function wording', () => {
    expect(isClaimSafe('Supports overnight recovery — helps you wind down before bed.')).toBe(true)
    expect(isClaimSafe('Replaces the salts you sweat out to support hydration.')).toBe(true)
    expect(isClaimSafe('Magnesium glycinate to help maintain normal muscle function.')).toBe(true)
  })
  it('treats empty/nullish copy as safe', () => {
    expect(isClaimSafe('')).toBe(true)
    expect(isClaimSafe(null)).toBe(true)
    expect(isClaimSafe(undefined)).toBe(true)
  })
})

describe('the mock catalogue stays claim-safe', () => {
  it('has no risky claims in any shortReason or description', () => {
    const offenders: string[] = []
    for (const p of MOCK_CATALOGUE) {
      for (const [field, copy] of [['shortReason', p.shortReason], ['description', p.description]] as const) {
        const flags = claimFlags(copy)
        if (flags.length > 0) offenders.push(`${p.id}.${field}: "${flags.map((f) => f.match).join(', ')}"`)
      }
    }
    expect(offenders).toEqual([])
  })
})
