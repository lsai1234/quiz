/**
 * First-month discount allocation — the odds on the scratch card are rationed
 * so the average discount across ACTUAL CHECKOUTS lands on the portal's
 * effective discount.
 */
import {
  chooseIntroRate,
  correctedAim,
  introOdds,
  ledgerTotals,
  tiltedOdds,
  EMPTY_LEDGER,
  type IntroLedger,
} from '../intro-allocation'
import { PRICING_CONFIG } from '../pricing'

const configWith = (effective: number) => ({
  ...PRICING_CONFIG,
  introOffer: { ...PRICING_CONFIG.introOffer, effectiveFirstMonthDiscount: effective },
})

const meanOf = (odds: { rate: number; probability: number }[]) =>
  odds.reduce((s, o) => s + o.rate * o.probability, 0)

/** A deterministic, uniformly-spread rng — sweeps [0,1) instead of sampling it. */
function sweepRng(n: number) {
  let i = 0
  return () => ((i++ % n) + 0.5) / n
}

/** Run `n` allocations, claiming every one, and report the realized mix. */
function simulate(effective: number, n: number) {
  const config = configWith(effective)
  const rng = sweepRng(97) // coprime with the run lengths, so the sweep doesn't alias
  let ledger: IntroLedger = EMPTY_LEDGER
  const granted: number[] = []
  for (let i = 0; i < n; i++) {
    const rate = chooseIntroRate(ledger, effective, config, rng)
    granted.push(rate)
    ledger = { claims: { ...ledger.claims, [String(rate)]: (ledger.claims[String(rate)] ?? 0) + 1 } }
  }
  return { granted, ...ledgerTotals(ledger) }
}

const shareOf = (granted: number[], rate: number) =>
  granted.filter((r) => r === rate).length / granted.length

describe('ledgerTotals', () => {
  it('is empty for a fresh ledger', () => {
    expect(ledgerTotals(EMPTY_LEDGER)).toEqual({ count: 0, sum: 0, mean: 0 })
  })

  it('blends the claimed rates', () => {
    const totals = ledgerTotals({ claims: { '0.5': 1, '0.1': 3 } })
    expect(totals.count).toBe(4)
    expect(totals.sum).toBeCloseTo(0.8, 10)
    expect(totals.mean).toBeCloseTo(0.2, 10)
  })

  it('ignores junk entries rather than skewing the average', () => {
    expect(ledgerTotals({ claims: { '0.25': 2, nonsense: 5, '0.5': -1 } }).count).toBe(2)
  })
})

describe('tiltedOdds', () => {
  it('hits the aim exactly for any reachable rate', () => {
    for (const aim of [0.1, 0.13, 0.18, 0.25, 0.33, 0.42, 0.5]) {
      expect(meanOf(tiltedOdds(aim))).toBeCloseTo(aim, 6)
    }
  })

  it('always returns a real distribution', () => {
    for (const aim of [0.1, 0.2, 0.3, 0.4, 0.5]) {
      const odds = tiltedOdds(aim)
      expect(odds.reduce((s, o) => s + o.probability, 0)).toBeCloseTo(1, 10)
      for (const o of odds) expect(o.probability).toBeGreaterThan(0)
    }
  })

  it('keeps every outcome in play even when the aim sits exactly on one', () => {
    // The whole point of tilting rather than picking nearest: a 25% target must
    // still hand out 50s and 10s, not turn the card into a fixed prize.
    const odds = tiltedOdds(0.25)
    expect(odds).toHaveLength(3)
    for (const o of odds) expect(o.probability).toBeGreaterThan(0.001)
  })

  it('saturates on the nearest outcome for an unreachable aim', () => {
    expect(meanOf(tiltedOdds(0.9))).toBeCloseTo(0.5, 4)
    expect(meanOf(tiltedOdds(0))).toBeCloseTo(0.1, 4)
  })

  it('shifts probability toward 50% as the aim rises', () => {
    const p50 = (aim: number) => tiltedOdds(aim).find((o) => o.rate === 0.5)!.probability
    expect(p50(0.45)).toBeGreaterThan(p50(0.3))
    expect(p50(0.3)).toBeGreaterThan(p50(0.15))
    expect(p50(0.15)).toBeGreaterThan(0)
  })

  it('leaves the configured weights alone at their natural average', () => {
    // Weights 1 : 10 : 10 over 0.5 / 0.25 / 0.1 average to 0.19047…
    const natural = (0.5 * 1 + 0.25 * 10 + 0.1 * 10) / 21
    const odds = tiltedOdds(natural)
    expect(odds.find((o) => o.rate === 0.5)!.probability).toBeCloseTo(1 / 21, 4)
    expect(odds.find((o) => o.rate === 0.25)!.probability).toBeCloseTo(10 / 21, 4)
  })

  it('returns nothing to grant when no outcomes are configured', () => {
    const noOutcomes = {
      ...PRICING_CONFIG,
      introOffer: { ...PRICING_CONFIG.introOffer, scratchReveal: { enabled: true, outcomes: [] } },
    }
    expect(tiltedOdds(0.2, noOutcomes)).toEqual([])
  })
})

describe('correctedAim', () => {
  it('aims at the target itself on a fresh ledger', () => {
    expect(correctedAim(EMPTY_LEDGER, 0.18)).toBeCloseTo(0.18, 10)
  })

  it('aims cheap when claims have overspent the budget', () => {
    expect(correctedAim({ claims: { '0.5': 10 } }, 0.18)).toBe(0.1)
  })

  it('aims rich when claims have underspent it', () => {
    expect(correctedAim({ claims: { '0.1': 10 } }, 0.35)).toBe(0.5)
  })

  it('never aims outside the configured outcomes', () => {
    expect(correctedAim({ claims: { '0.5': 500 } }, 0.18)).toBe(0.1)
    expect(correctedAim({ claims: { '0.1': 500 } }, 0.45)).toBe(0.5)
  })
})

describe('chooseIntroRate', () => {
  it('converges the realized average on the effective discount', () => {
    for (const effective of [0.12, 0.15, 0.18, 0.25, 0.32, 0.4]) {
      expect(simulate(effective, 600).mean).toBeCloseTo(effective, 2)
    }
  })

  it('hands out all three outcomes across a run', () => {
    for (const effective of [0.15, 0.25, 0.35]) {
      expect(new Set(simulate(effective, 600).granted)).toEqual(new Set([0.5, 0.25, 0.1]))
    }
  })

  it('makes 50% commoner the higher the effective discount', () => {
    const share = (effective: number) => shareOf(simulate(effective, 600).granted, 0.5)
    expect(share(0.4)).toBeGreaterThan(share(0.25))
    expect(share(0.25)).toBeGreaterThan(share(0.12))
  })

  it('grants only the top outcome when the target reaches it', () => {
    expect(new Set(simulate(0.5, 200).granted)).toEqual(new Set([0.5]))
  })

  it('grants only the bottom outcome when the target reaches it', () => {
    expect(new Set(simulate(0.1, 200).granted)).toEqual(new Set([0.1]))
  })

  it('only ever returns a configured outcome', () => {
    const valid = new Set([0.5, 0.25, 0.1])
    for (const rate of simulate(0.3, 300).granted) expect(valid.has(rate)).toBe(true)
  })

  it('recovers the average after a run of overspending', () => {
    // Seed the ledger 20 claims deep at 50% and let it correct against an 18%
    // target — the blended average must come back down.
    const config = configWith(0.18)
    const rng = sweepRng(97)
    let ledger: IntroLedger = { claims: { '0.5': 20 } }
    for (let i = 0; i < 600; i++) {
      const rate = chooseIntroRate(ledger, 0.18, config, rng)
      ledger = { claims: { ...ledger.claims, [String(rate)]: (ledger.claims[String(rate)] ?? 0) + 1 } }
    }
    expect(ledgerTotals(ledger).mean).toBeCloseTo(0.18, 2)
  })

  it('reflects the ledger in the odds it draws against', () => {
    const rich = introOdds({ claims: { '0.5': 10 } }, 0.18)
    const fresh = introOdds(EMPTY_LEDGER, 0.18)
    const p50 = (odds: { rate: number; probability: number }[]) =>
      odds.find((o) => o.rate === 0.5)!.probability
    expect(p50(rich)).toBeLessThan(p50(fresh))
  })

  it('grants nothing when no outcomes are configured', () => {
    const noOutcomes = {
      ...PRICING_CONFIG,
      introOffer: { ...PRICING_CONFIG.introOffer, scratchReveal: { enabled: true, outcomes: [] } },
    }
    expect(chooseIntroRate(EMPTY_LEDGER, 0.2, noOutcomes)).toBe(0)
  })
})
