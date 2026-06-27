import {
  createMockSubscription,
  nextDispatchDate,
  setDispatchDay,
  pauseSubscription,
  resumeSubscription,
  cancelSubscription,
  canCancel,
  monthsRemainingOnTerm,
  swapSubscriptionLine,
  swappableForLine,
  flatMonthlyOf,
  computeSwapImpact,
  addLine,
  removeLine,
  setLineCadence,
  setLineQuantity,
  snoozeSubscription,
  downsizePreview,
  skipNextDelivery,
  oneOffCharge,
  lineMonthly,
  lineSettlement,
  shippedValueToDate,
  paidToDate,
  deliveriesInMonths,
  effectiveNextDispatch,
  sendNow,
  bringForward,
  delayDispatch,
  computeAddImpact,
  computeRemoveImpact,
  computeOneOffImpact,
} from '../mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { getPricingConfig, unitCostOf } from '@/lib/stack-blueprint/pricing'

const sub = () => createMockSubscription(MOCK_CATALOGUE, 'test@example.com')

/** A subscription-eligible product not already in the given subscription. */
const addable = (s = sub()) =>
  MOCK_CATALOGUE.find(
    (p) => p.subscriptionEligible && !p.isSubscriptionOnly && !s.lines.some((l) => l.productId === p.id),
  )!

describe('createMockSubscription', () => {
  it('builds an active subscription with lines and a flat monthly price', () => {
    const s = sub()
    expect(s.status).toBe('active')
    expect(s.customerEmail).toBe('test@example.com')
    expect(s.lines.length).toBeGreaterThan(0)
    expect(s.flatMonthly).toBeGreaterThan(0)
    expect(s.minMonths).toBeGreaterThanOrEqual(1)
  })

  it('flatMonthly equals the summed amortised line prices', () => {
    const s = sub()
    expect(s.flatMonthly).toBeCloseTo(flatMonthlyOf(s.lines), 1)
  })
})

describe('nextDispatchDate', () => {
  it('returns the next occurrence of the chosen day', () => {
    const from = new Date('2026-06-10')
    expect(nextDispatchDate(15, from).getDate()).toBe(15) // later this month
    expect(nextDispatchDate(5, from).getMonth()).toBe(from.getMonth() + 1) // already passed → next month
  })

  it('caps the day at 28', () => {
    expect(nextDispatchDate(31, new Date('2026-06-01')).getDate()).toBe(28)
  })
})

describe('dispatch day + pause/resume', () => {
  it('updates the dispatch day (clamped 1–28)', () => {
    expect(setDispatchDay(sub(), 20).dispatchDayOfMonth).toBe(20)
    expect(setDispatchDay(sub(), 40).dispatchDayOfMonth).toBe(28)
  })

  it('pauses (once past the minimum term) and resumes', () => {
    const eligible = { ...sub(), minMonths: 4, monthsActive: 4 }
    const paused = pauseSubscription(eligible)
    expect(paused.status).toBe('paused')
    expect(resumeSubscription(paused).status).toBe('active')
  })

  it('blocks pause during the minimum term', () => {
    const s = { ...sub(), minMonths: 4, monthsActive: 2 }
    expect(pauseSubscription(s).status).toBe('active')
  })
})

describe('minimum-term cancel guard', () => {
  it('blocks cancel before the minimum term and reports months left', () => {
    const s = { ...sub(), minMonths: 4, monthsActive: 2 }
    expect(monthsRemainingOnTerm(s)).toBe(2)
    expect(canCancel(s)).toBe(false)
    expect(cancelSubscription(s).status).toBe('active') // unchanged
  })

  it('allows cancel once the minimum term is met', () => {
    const s = { ...sub(), minMonths: 4, monthsActive: 4 }
    expect(canCancel(s)).toBe(true)
    expect(cancelSubscription(s).status).toBe('cancelled')
  })
})

describe('swapSubscriptionLine', () => {
  it('replaces a line with a same-group product and re-prices the flat monthly', () => {
    const s = sub()
    const line = s.lines[0]
    const alternatives = swappableForLine(line, MOCK_CATALOGUE)
    expect(alternatives.length).toBeGreaterThan(0)

    const swapped = swapSubscriptionLine(s, line.id, alternatives[0])
    const newLine = swapped.lines.find((l) => l.id === line.id)!
    expect(newLine.productId).toBe(alternatives[0].id)
    expect(swapped.flatMonthly).toBeCloseTo(flatMonthlyOf(swapped.lines), 1)
  })

  it('only offers eligible, same-slot, non-refill products', () => {
    const s = sub()
    for (const alt of swappableForLine(s.lines[0], MOCK_CATALOGUE)) {
      expect(alt.stackSlots).toContain(s.lines[0].stackSlot)
      expect(alt.isSubscriptionOnly).toBeFalsy()
      expect(alt.subscriptionEligible).toBe(true)
    }
  })
})

describe('computeSwapImpact', () => {
  it('reports the monthly change, one-off and effective date for a swap', () => {
    const s = sub()
    const line = s.lines[0]
    const alt = swappableForLine(line, MOCK_CATALOGUE)[0]
    const impact = computeSwapImpact(s, line.id, alt)

    expect(impact.currentMonthly).toBe(s.flatMonthly)
    expect(impact.newMonthly).toBe(swapSubscriptionLine(s, line.id, alt).flatMonthly)
    expect(impact.monthlyDelta).toBeCloseTo(impact.newMonthly - impact.currentMonthly, 2)
    // one-off equals the per-delivery price difference for the imminent box
    const newPpd = swapSubscriptionLine(s, line.id, alt).lines.find((l) => l.id === line.id)!.pricePerDelivery
    expect(impact.oneOffNow).toBeCloseTo(newPpd - line.pricePerDelivery, 2)
    expect(new Date(impact.effectiveFrom).getTime()).toBeGreaterThan(0)
  })
})

describe('addLine', () => {
  it('adds a new line, raises the flat monthly, and stays reconciled', () => {
    const s = sub()
    const p = addable(s)
    const next = addLine(s, p, MOCK_CATALOGUE)
    expect(next.lines.length).toBe(s.lines.length + 1)
    const added = next.lines.find((l) => l.productId === p.id)!
    expect(added.deliveriesMade).toBe(0) // nothing shipped yet
    expect(added.addedAt).toBeTruthy()
    expect(next.flatMonthly).toBeGreaterThanOrEqual(s.flatMonthly)
    expect(next.flatMonthly).toBeCloseTo(flatMonthlyOf(next.lines), 1)
  })

  it('prices the added line at the sub rate but never below the margin floor', () => {
    const s = sub()
    const p = addable(s)
    const added = addLine(s, p, MOCK_CATALOGUE).lines.find((l) => l.productId === p.id)!
    const variant = p.variants.find((v) => v.available) ?? p.variants[0]
    const unitPrice = variant?.price ?? p.basePrice
    const cost = unitCostOf(p, unitPrice)
    const floorPerUnit = cost * (1 + getPricingConfig().marginFloorPct)
    expect(added.pricePerDelivery / added.quantity).toBeGreaterThanOrEqual(floorPerUnit - 0.01)
  })

  it('never adds a duplicate product', () => {
    const s = sub()
    const existing = MOCK_CATALOGUE.find((p) => p.id === s.lines[0].productId)!
    expect(addLine(s, existing, MOCK_CATALOGUE).lines.length).toBe(s.lines.length)
  })

  it('computeAddImpact reports the monthly delta without a one-off', () => {
    const s = sub()
    const impact = computeAddImpact(s, addable(s), MOCK_CATALOGUE)
    expect(impact.oneOffNow).toBe(0)
    expect(impact.monthlyDelta).toBeCloseTo(impact.newMonthly - impact.currentMonthly, 2)
  })
})

describe('pay-for-what-shipped settlement', () => {
  it('charges nothing to remove a line that has not shipped', () => {
    const s = sub()
    const withAdded = addLine(s, addable(s), MOCK_CATALOGUE)
    const added = withAdded.lines.find((l) => l.deliveriesMade === 0)!
    const { sub: after, settlement } = removeLine(withAdded, added.id)
    expect(settlement).toBe(0)
    expect(after.lines.find((l) => l.id === added.id)).toBeUndefined()
    expect(after.flatMonthly).toBeCloseTo(flatMonthlyOf(after.lines), 1)
  })

  it('settles the un-amortised value of goods already shipped', () => {
    // A line that shipped a £45 box but has only paid ~one smoothed month.
    const s = sub()
    const line = { ...s.lines[0], pricePerDelivery: 45, deliveryIntervalMonths: 3, deliveriesMade: 1 }
    const loaded = { ...s, monthsActive: 1, lines: [line, ...s.lines.slice(1)] }
    const expected = Math.max(0, shippedValueToDate(line) - paidToDate(line, loaded))
    expect(expected).toBeGreaterThan(0)
    expect(removeLine(loaded, line.id).settlement).toBeCloseTo(expected, 2)
    expect(computeRemoveImpact(loaded, line.id).settlement).toBeCloseTo(expected, 2)
  })

  it('settles nothing once the shipped value has been paid off', () => {
    const s = sub()
    const line = { ...s.lines[0], pricePerDelivery: 30, deliveryIntervalMonths: 1, deliveriesMade: 1 }
    const loaded = { ...s, monthsActive: 6, lines: [line] }
    expect(lineSettlement(line, loaded)).toBe(0)
  })
})

describe('setLineCadence', () => {
  it('clamps to 1..maxDeliveryMonths and re-derives the flat monthly', () => {
    const s = sub()
    const id = s.lines[0].id
    const faster = setLineCadence(s, id, 1)
    const slower = setLineCadence(s, id, 99)
    expect(faster.lines.find((l) => l.id === id)!.deliveryIntervalMonths).toBe(1)
    expect(slower.lines.find((l) => l.id === id)!.deliveryIntervalMonths).toBe(getPricingConfig().maxDeliveryMonths)
    // Shipping more often costs at least as much per month as shipping less often.
    expect(lineMonthly(faster.lines.find((l) => l.id === id)!)).toBeGreaterThanOrEqual(
      lineMonthly(slower.lines.find((l) => l.id === id)!) - 0.01,
    )
    expect(faster.flatMonthly).toBeCloseTo(flatMonthlyOf(faster.lines), 1)
  })
})

describe('snoozeSubscription (save flow)', () => {
  it('pauses with a future return date and defers the term — even mid-term', () => {
    const s = { ...sub(), minMonths: 4, monthsActive: 2 }
    const before = monthsRemainingOnTerm(s)
    const snoozed = snoozeSubscription(s, 2)
    expect(snoozed.status).toBe('paused')
    expect(new Date(snoozed.snoozeUntil!).getTime()).toBeGreaterThan(Date.now())
    expect(monthsRemainingOnTerm(snoozed)).toBe(before + 2) // deferred, not bypassed
  })

  it('clamps to 1..3 months', () => {
    expect(snoozeSubscription(sub(), 0).snoozedMonths).toBe(1)
    expect(snoozeSubscription(sub(), 9).snoozedMonths).toBe(3)
  })
})

describe('downsizePreview (save flow)', () => {
  it('drops felt extras, keeps essentials, lowers the monthly, never empties', () => {
    const s = sub()
    const d = downsizePreview(s, MOCK_CATALOGUE)
    expect(d.keptLineIds.length).toBeGreaterThan(0)
    expect(d.newMonthly).toBeLessThanOrEqual(d.currentMonthly)
    if (d.droppedLines.length > 0) expect(d.newMonthly).toBeLessThan(d.currentMonthly)
    expect(d.keptLineIds.length + d.droppedLines.length).toBe(s.lines.length)
  })
})

describe('setLineQuantity', () => {
  it('scales price per delivery with quantity and keeps the unit price', () => {
    const s = sub()
    const line = s.lines[0]
    const unit = line.pricePerDelivery / line.quantity
    const next = setLineQuantity(s, line.id, line.quantity + 1)
    const nl = next.lines.find((l) => l.id === line.id)!
    expect(nl.quantity).toBe(line.quantity + 1)
    expect(nl.pricePerDelivery / nl.quantity).toBeCloseTo(unit, 2)
    expect(next.flatMonthly).toBeGreaterThan(s.flatMonthly)
    expect(next.flatMonthly).toBeCloseTo(flatMonthlyOf(next.lines), 1)
  })

  it('clamps to 1..6', () => {
    const s = sub()
    expect(setLineQuantity(s, s.lines[0].id, 0).lines.find((l) => l.id === s.lines[0].id)!.quantity).toBe(1)
    expect(setLineQuantity(s, s.lines[0].id, 99).lines.find((l) => l.id === s.lines[0].id)!.quantity).toBe(6)
  })
})

describe('skip + one-off', () => {
  it('skip banks a credit equal to the box value and pushes the next ship date', () => {
    const s = sub()
    const line = s.lines[0]
    const next = skipNextDelivery(s, line.id)
    const nl = next.lines.find((l) => l.id === line.id)!
    expect(nl.pendingCredit).toBeCloseTo(line.pricePerDelivery, 2)
    expect(new Date(nl.nextShipAt!).getTime()).toBeGreaterThan(Date.now())
  })

  it('one-off charges the full per-unit price and leaves the plan untouched', () => {
    const s = sub()
    const line = s.lines[0]
    const expected = line.pricePerDelivery / line.quantity
    expect(oneOffCharge(line, 1)).toBeCloseTo(expected, 2)
    const impact = computeOneOffImpact(s, line.id, 1)
    expect(impact.oneOffNow).toBeCloseTo(expected, 2)
    expect(impact.monthlyDelta).toBe(0) // recurring plan unchanged
  })
})

describe('next-box date controls', () => {
  it('sendNow / bringForward / delay set an override that effectiveNextDispatch honours', () => {
    const s = sub()
    const now = sendNow(s)
    expect(now.nextDispatchOverride).toBeTruthy()
    // bring-forward is clamped to not before today
    expect(effectiveNextDispatch(bringForward(s, 1000)).getTime()).toBeGreaterThanOrEqual(Date.now() - 1000)
    // delay pushes the date out beyond the default cadence
    const base = effectiveNextDispatch(s).getTime()
    expect(effectiveNextDispatch(delayDispatch(s, 7)).getTime()).toBeGreaterThan(base)
  })
})

describe('deliveriesInMonths', () => {
  it('counts the signup delivery plus one per elapsed cadence', () => {
    expect(deliveriesInMonths(0, 1)).toBe(1)
    expect(deliveriesInMonths(2, 1)).toBe(3)
    expect(deliveriesInMonths(2, 3)).toBe(1)
  })
})
