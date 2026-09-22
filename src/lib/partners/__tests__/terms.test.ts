import { canTakeEffect, defaultTerms, describePayout, describeTerms, flatTerms, sortedHistory, termsInForce } from '@/lib/partners/terms'
import { PRICING_CONFIG } from '@/lib/stack-blueprint/pricing'
import type { PartnerTerms } from '@/lib/partners/types'

function terms(effectiveFrom: string, over: Partial<PartnerTerms> = {}): PartnerTerms {
  return {
    id: `ptrm_${effectiveFrom}`,
    partnerId: 'ptnr_1',
    firstOrderPct: 0.15,
    renewalPct: 0.05,
    renewalMonths: 6,
    payout: { cadence: 'monthly', minimum: 25, selfBilled: true, chargesVat: false },
    effectiveFrom,
    note: null,
    createdBy: null,
    createdAt: effectiveFrom,
    ...over,
  }
}

describe('defaultTerms', () => {
  it('starts a partner on the programme-wide rates', () => {
    const d = defaultTerms(PRICING_CONFIG)
    expect(d.firstOrderPct).toBe(PRICING_CONFIG.partners.firstOrderPct)
    expect(d.renewalPct).toBe(PRICING_CONFIG.partners.renewalPct)
    expect(d.renewalMonths).toBe(PRICING_CONFIG.partners.renewalMonths)
    expect(d.payout.minimum).toBe(PRICING_CONFIG.partners.payout.minimum)
  })
})

describe('termsInForce', () => {
  const history = [terms('2026-01-01T00:00:00.000Z'), terms('2026-06-01T00:00:00.000Z', { firstOrderPct: 0.2 })]

  it('is the latest one that has actually taken effect', () => {
    expect(termsInForce(history, new Date('2026-03-01'))!.firstOrderPct).toBe(0.15)
    expect(termsInForce(history, new Date('2026-07-01'))!.firstOrderPct).toBe(0.2)
  })

  it('ignores a future-dated row', () => {
    // A rate agreed to start next month must not be what this month's
    // commission is calculated at.
    const future = [terms('2026-01-01T00:00:00.000Z'), terms('2030-01-01T00:00:00.000Z', { firstOrderPct: 0.9 })]
    expect(termsInForce(future, new Date('2026-03-01'))!.firstOrderPct).toBe(0.15)
  })

  it('is null when nothing has taken effect yet', () => {
    expect(termsInForce([terms('2030-01-01T00:00:00.000Z')], new Date('2026-01-01'))).toBeNull()
  })
})

describe('sortedHistory', () => {
  it('is newest first, which is the order a partner reads it in', () => {
    const out = sortedHistory([terms('2026-01-01T00:00:00.000Z'), terms('2026-06-01T00:00:00.000Z')])
    expect(out.map((t) => t.effectiveFrom)).toEqual(['2026-06-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'])
  })
})

describe('canTakeEffect', () => {
  it('allows any date while nothing has been earned', () => {
    expect(canTakeEffect('2020-01-01T00:00:00.000Z', null).ok).toBe(true)
  })

  it('refuses backdating over commission already earned', () => {
    // The ledger stores the rate that applied on the day. Backdating past it
    // would leave the stored rate and the stated terms disagreeing, and the
    // partner would be told they were on a rate they were never paid.
    const check = canTakeEffect('2026-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z')
    expect(check.ok).toBe(false)
    expect(check.ok === false && check.reason).toMatch(/already been earned/)
  })

  it('allows a change from the oldest unsettled date onwards', () => {
    expect(canTakeEffect('2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z').ok).toBe(true)
    expect(canTakeEffect('2026-04-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z').ok).toBe(true)
  })

  it('rejects a date it cannot parse rather than guessing', () => {
    expect(canTakeEffect('not a date', null).ok).toBe(false)
  })
})

describe('an affiliate\'s terms', () => {
  it('are the founder\'s rate on both halves of the deal', () => {
    const t = flatTerms(0.12)
    expect(t.firstOrderPct).toBe(0.12)
    expect(t.renewalPct).toBe(0.12)
    // Not a lifetime rate: the renewal window is the programme's, for the
    // reason `PRICING_CONFIG.partners.renewalMonths` gives.
    expect(t.renewalMonths).toBe(PRICING_CONFIG.partners.renewalMonths)
    expect(t.note).toMatch(/affiliate/i)
  })

  it('clamp a rate that is not a rate', () => {
    expect(flatTerms(1.4).firstOrderPct).toBe(1)
    expect(flatTerms(-0.2).firstOrderPct).toBe(0)
  })

  it('keep the programme\'s payout arrangements', () => {
    // How they are paid is not part of what makes them an affiliate — the
    // cadence, the minimum and the self-billing are the same machinery.
    expect(flatTerms(0.12).payout).toEqual(defaultTerms().payout)
  })
})

describe('the wording a partner reads', () => {
  it('states the deal in whole sentences', () => {
    expect(describeTerms(terms('2026-01-01T00:00:00.000Z'))).toBe(
      '15% of the net on a first order, then 5% of every renewal for 6 months from signup.',
    )
  })

  it('states one rate as one sentence', () => {
    // An affiliate earns the same percentage whichever order it is, and
    // "20% on a first order, then 20% of every renewal" makes a reader hunt for
    // a difference between the halves that is not there.
    expect(describeTerms(terms('2026-01-01T00:00:00.000Z', { firstOrderPct: 0.2, renewalPct: 0.2 }))).toBe(
      '20% of the net on every order your code brings in, including renewals for 6 months from signup.',
    )
  })

  it('states how they get paid, including the minimum', () => {
    expect(describePayout({ cadence: 'monthly', minimum: 25, selfBilled: true, chargesVat: false })).toBe(
      'Monthly in arrears, once you are owed at least £25. We raise the invoice for you.',
    )
  })

  it('mentions VAT only when the partner charges it', () => {
    expect(describePayout({ cadence: 'monthly', minimum: 25, selfBilled: true, chargesVat: true })).toMatch(/plus VAT/)
  })
})
