/**
 * @jest-environment jsdom
 */
import {
  markCameFromStack,
  readStackHandoff,
  clearStackHandoff,
  whatIsLost,
  stackOnlyRate,
  leavingStackNotes,
  STACK_RETURN_HREF,
  type LeavingStack,
} from '../stack-handoff'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'

beforeEach(() => sessionStorage.clear())

describe('remembering that a shopper left a stack', () => {
  it('survives a round trip', () => {
    markCameFromStack({ items: 3, discountPct: 0.25 })
    expect(readStackHandoff()).toEqual({ items: 3, discountPct: 0.25 })
  })

  it('is nothing until somebody leaves a stack', () => {
    expect(readStackHandoff()).toBeNull()
  })

  it('is forgotten on request', () => {
    markCameFromStack({ items: 2, discountPct: 0.25 })
    clearStackHandoff()
    expect(readStackHandoff()).toBeNull()
  })

  /*
    Everything here is read back out of storage the browser owns, so all of it
    is somebody else's data by the time it returns. A bar that renders "NaN
    items" or claims a 4000% discount because a value was edited is worse than
    no bar.
  */
  it('refuses a record that has been tampered with', () => {
    sessionStorage.setItem('chrgd.from-stack', 'not json')
    expect(readStackHandoff()).toBeNull()

    sessionStorage.setItem('chrgd.from-stack', JSON.stringify({ items: 0, discountPct: 0.25 }))
    expect(readStackHandoff()).toBeNull()

    sessionStorage.setItem('chrgd.from-stack', JSON.stringify({ items: 'three', discountPct: 0.25 }))
    expect(readStackHandoff()).toBeNull()
  })

  it('clamps a discount that could not be real', () => {
    sessionStorage.setItem('chrgd.from-stack', JSON.stringify({ items: 3, discountPct: 40 }))
    expect(readStackHandoff()?.discountPct).toBe(1)

    sessionStorage.setItem('chrgd.from-stack', JSON.stringify({ items: 3, discountPct: -1 }))
    expect(readStackHandoff()?.discountPct).toBe(0)

    sessionStorage.setItem('chrgd.from-stack', JSON.stringify({ items: 3 }))
    expect(readStackHandoff()?.discountPct).toBe(0)
  })
})

describe('whatIsLost', () => {
  it('names the discount being given up', () => {
    expect(whatIsLost(0.25)).toBe('25% off')
    expect(whatIsLost(0.15)).toBe('15% off')
  })

  /*
    Somebody with no code loses nothing by shopping à la carte, and warning
    them about it invents a loss. They still get the door — just without a
    caveat that would not be true.
  */
  it('says nothing when there is nothing to lose', () => {
    expect(whatIsLost(0)).toBeNull()
    expect(whatIsLost(Number.NaN)).toBeNull()
  })
})

describe('stackOnlyRate', () => {
  it('is a partner code’s rate, which does not work on single products', () => {
    expect(stackOnlyRate('partner', 0.25)).toBe(0.25)
  })

  // A store code and a founder code both work in the shop, so nothing is lost.
  it('is nothing for a store code or a founder code', () => {
    expect(stackOnlyRate('store', 0.25)).toBe(0)
    expect(stackOnlyRate('founder', 0)).toBe(0)
  })

  it('reads a code of unknown kind as a partner’s', () => {
    expect(stackOnlyRate(null, 0.2)).toBe(0.2)
    expect(stackOnlyRate(undefined, Number.NaN)).toBe(0)
  })
})

describe('leavingStackNotes', () => {
  /*
    The bundle deal's numbers are read from the live config, never typed in
    here, so a founder moving the threshold cannot leave these passing over
    copy that has stopped being true.
  */
  const tier = getPricingConfig().bundleTiers[0]
  const pct = `${Math.round(tier.discountPct * 1000) / 10}%`
  const at = `£${tier.minSubtotal}`
  const over = [tier.minSubtotal! / 2, tier.minSubtotal! / 2 + 5]
  const under = [tier.minSubtotal! / 2 - 5]
  const keepsTier = `The shop takes ${pct} off when your basket is ${at} or more.`

  const notes = (s: Partial<LeavingStack>) =>
    leavingStackNotes({ code: null, kind: null, rate: 0, prices: over, ...s })

  it('says the bundle deal holds only while the basket stays over its threshold', () => {
    expect(notes({})).toEqual([keepsTier])
  })

  it('says nothing for a stack that has earned nothing and carries no code', () => {
    expect(notes({ prices: under })).toEqual([])
  })

  it('says a partner’s code stays behind, and the bundle deal does not', () => {
    expect(notes({ code: 'SARAH20', kind: 'partner', rate: 0.2 })).toEqual([
      'SARAH20 works on stacks and subscriptions, not single products, so its 20% off won’t apply in the shop.',
      keepsTier,
    ])
    expect(notes({ code: 'SARAH20', kind: 'partner', rate: 0.2, prices: under })).toEqual([
      'SARAH20 works on stacks and subscriptions, not single products, so its 20% off won’t apply in the shop.',
    ])
  })

  /*
    The sentence this replaces told a store-code holder their code applied to
    the stack only. Store codes work on single products; what they do not do
    is travel from this page to the basket.
  */
  it('says a store code works in the shop and has to be in the basket', () => {
    expect(notes({ code: 'IGNITE25', kind: 'store', rate: 0.25 })).toEqual([
      'IGNITE25 works on single products too. If your shop basket doesn’t show it, enter it there.',
    ])
  })

  it('still names the bundle deal beside a store code that takes off less than it', () => {
    expect(notes({ code: 'SMALL5', kind: 'store', rate: 0.05 })).toEqual([
      'SMALL5 works on single products too. If your shop basket doesn’t show it, enter it there.',
      keepsTier,
    ])
  })

  it('says a founder code works in the shop too', () => {
    expect(notes({ code: 'FH-FREE-AB12', kind: 'founder', rate: 0 })).toEqual([
      'FH-FREE-AB12 works on single products too. If your shop basket doesn’t show it, enter it there.',
    ])
  })

  it('never says the stack is saved, or that the shop is full price', () => {
    const all = [
      notes({}),
      notes({ code: 'SARAH20', kind: 'partner', rate: 0.2 }),
      notes({ code: 'SARAH20', kind: 'partner', rate: 0.2, prices: under }),
      notes({ code: 'IGNITE25', kind: 'store', rate: 0.25 }),
    ].flat().join(' ')
    expect(all).not.toMatch(/saved|full price/i)
  })

  it('reads the threshold and rate from the config it is given', () => {
    const config = {
      ...getPricingConfig(),
      bundleTiers: [{ id: 't', label: '£60+ bundle', minSubtotal: 60, discountPct: 0.125 }],
    }
    expect(leavingStackNotes({ code: null, kind: null, rate: 0, prices: [35, 30] }, config)).toEqual([
      'The shop takes 12.5% off when your basket is £60 or more.',
    ])

    const byCount = { ...config, bundleTiers: [{ id: 'n', label: '3 for less', minItems: 3, discountPct: 0.1 }] }
    expect(leavingStackNotes({ code: null, kind: null, rate: 0, prices: [10, 10, 10] }, byCount)).toEqual([
      'The shop takes 10% off when your basket has 3 or more products.',
    ])
  })
})

describe('the way back', () => {
  it('points at the hash the reveal reopens on', () => {
    expect(STACK_RETURN_HREF).toBe('/#stack')
  })
})
