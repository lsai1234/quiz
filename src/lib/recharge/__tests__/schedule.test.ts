import {
  buildDeliverySchedule,
  nextDelivery,
  skipCredit,
  nextChargeBreakdown,
  skipDelivery,
  unskipDelivery,
  rescheduleDelivery,
  addItemToDelivery,
  removeItemFromDelivery,
  oneOffUnitPrice,
} from '../schedule'
import { createMockSubscription, monthsRemainingOnTerm, skippedDeliveryCount } from '../mock'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { recurringDeliveryOption } from '@/lib/pricing/delivery'

const NOW = new Date('2026-06-27T12:00:00Z')
const sub = () => createMockSubscription(MOCK_CATALOGUE, 'test@example.com')
const schedule = (s = sub()) => buildDeliverySchedule(s, MOCK_CATALOGUE, 6, NOW)

const addable = (s = sub()) =>
  MOCK_CATALOGUE.find(
    (p) => p.subscriptionEligible && !p.isSubscriptionOnly && !s.lines.some((l) => l.productId === p.id),
  )!

describe('buildDeliverySchedule', () => {
  it('projects the requested number of months with a single "next" box', () => {
    const ds = schedule()
    expect(ds).toHaveLength(6)
    expect(ds.filter((d) => d.isNext)).toHaveLength(1)
    expect(nextDelivery(ds)!.items.length).toBeGreaterThan(0)
  })

  it('staggers multi-month items so they are not in every box', () => {
    const ds = schedule()
    const multi = sub().lines.find((l) => l.deliveryIntervalMonths > 1)
    if (!multi) return
    const boxesWithIt = ds.filter((d) => d.items.some((it) => it.lineId === multi.id)).length
    expect(boxesWithIt).toBeLessThan(ds.length)
  })

  it('box total equals the sum of its item prices', () => {
    for (const d of schedule()) {
      const sum = d.items.reduce((s, it) => s + it.price, 0)
      expect(d.total).toBeCloseTo(Math.round(sum * 100) / 100, 2)
    }
  })
})

describe('per-box edits never change the flat monthly', () => {
  it('skip / reschedule / add / remove all leave flatMonthly untouched', () => {
    const s = sub()
    const ds = buildDeliverySchedule(s, MOCK_CATALOGUE, 6, NOW)
    const box = nextDelivery(ds)!
    const before = s.flatMonthly

    let s2 = skipDelivery(s, box.id)
    s2 = rescheduleDelivery(s2, ds[1].id, new Date('2026-08-20'))
    s2 = addItemToDelivery(s2, ds[2].id, addable(s))
    const recurringItem = ds[2].items.find((it) => it.lineId)!
    s2 = removeItemFromDelivery(s2, ds[2].id, recurringItem)

    expect(s2.flatMonthly).toBe(before)
  })
})

describe('skipDelivery', () => {
  it('marks the box skipped and credits its recurring value', () => {
    const s = sub()
    const ds = buildDeliverySchedule(s, MOCK_CATALOGUE, 6, NOW)
    const box = nextDelivery(ds)!
    const credit = skipCredit(box)
    const after = buildDeliverySchedule(skipDelivery(s, box.id), MOCK_CATALOGUE, 6, NOW)
    const same = after.find((d) => d.id === box.id)!
    expect(same.status).toBe('skipped')
    expect(credit).toBeGreaterThan(0)
    // The next shipping box moves on.
    expect(nextDelivery(after)!.id).not.toBe(box.id)
  })

  it('unskip restores it', () => {
    const s = sub()
    const id = nextDelivery(schedule(s))!.id
    const restored = buildDeliverySchedule(unskipDelivery(skipDelivery(s, id), id), MOCK_CATALOGUE, 6, NOW)
    expect(restored.find((d) => d.id === id)!.status).toBe('scheduled')
  })

  it('defers the minimum term instead of burning a month', () => {
    const s = { ...sub(), minMonths: 4, monthsActive: 2 }
    const before = monthsRemainingOnTerm(s)
    const id = nextDelivery(buildDeliverySchedule(s, MOCK_CATALOGUE, 6, NOW))!.id
    const after = skipDelivery(s, id)
    expect(skippedDeliveryCount(after)).toBe(1)
    expect(monthsRemainingOnTerm(after)).toBe(before + 1)
  })
})

describe('nextChargeBreakdown', () => {
  it('charges the flat monthly plus the postage that rides with it', () => {
    // The postage is a real second line on the member's Stripe invoice. This
    // used to return the plan alone, so the hub told someone on a £53.25 plan
    // that their next charge was £53.25 while Stripe took £56.20 — on the one
    // screen whose whole job is answering "what am I actually charged?".
    const s = sub()
    const c = nextChargeBreakdown(s, schedule(s))
    expect(c.plan).toBe(s.flatMonthly)
    expect(c.delivery).toBeGreaterThan(0)
    expect(c.extras).toBe(0)
    expect(c.credits).toBe(0)
    expect(c.net).toBeCloseTo(s.flatMonthly + c.delivery, 2)
    expect(c.date).toBe(nextDelivery(schedule(s))!.date)
  })

  it('charges no postage on a plan that clears the free-delivery line', () => {
    const s = { ...sub(), flatMonthly: 150 }
    const c = nextChargeBreakdown(s, schedule(s))
    expect(c.delivery).toBe(0)
    expect(c.net).toBeCloseTo(150, 2)
  })

  it('quotes the same postage the Stripe line was created at', () => {
    // Both read `recurringDeliveryOption` off the plan's own monthly. Computing
    // them from different inputs is how the two would drift.
    const s = sub()
    const c = nextChargeBreakdown(s, schedule(s))
    expect(c.delivery).toBe(recurringDeliveryOption(s.flatMonthly)?.price ?? 0)
  })

  it('adds one-off extras on top of the flat monthly', () => {
    const s = sub()
    const id = nextDelivery(schedule(s))!.id
    const s2 = addItemToDelivery(s, id, addable(s))
    const ds = buildDeliverySchedule(s2, MOCK_CATALOGUE, 6, NOW)
    const c = nextChargeBreakdown(s2, ds)
    expect(c.extras).toBeGreaterThan(0)
    expect(c.net).toBeCloseTo(c.plan + c.delivery + c.extras - c.credits, 2)
  })
})

describe('rescheduleDelivery', () => {
  it('moves the box to the chosen date', () => {
    const s = sub()
    const id = schedule(s)[1].id
    const moved = buildDeliverySchedule(rescheduleDelivery(s, id, new Date('2026-08-03')), MOCK_CATALOGUE, 6, NOW)
    expect(new Date(moved.find((d) => d.id === id)!.date).getDate()).toBe(3)
  })
})

describe('add / remove items in a box', () => {
  it('adds a full-price one-off to a single box', () => {
    const s = sub()
    const p = addable(s)
    const id = schedule(s)[2].id
    const after = buildDeliverySchedule(addItemToDelivery(s, id, p), MOCK_CATALOGUE, 6, NOW)
    const box = after.find((d) => d.id === id)!
    const added = box.items.find((it) => it.productId === p.id)!
    expect(added.oneOff).toBe(true)
    expect(added.price).toBeCloseTo(oneOffUnitPrice(p), 2)
    expect(box.oneOffTotal).toBeGreaterThan(0)
    // Only that box is affected.
    const other = after.find((d) => d.id !== id && d.items.length > 0)!
    expect(other.items.some((it) => it.productId === p.id && it.oneOff)).toBe(false)
  })

  it('removes a recurring item from one box only', () => {
    const s = sub()
    const ds = schedule(s)
    const box = ds.find((d) => d.items.some((it) => it.lineId))!
    const item = box.items.find((it) => it.lineId)!
    const after = buildDeliverySchedule(removeItemFromDelivery(s, box.id, item), MOCK_CATALOGUE, 6, NOW)
    expect(after.find((d) => d.id === box.id)!.items.some((it) => it.lineId === item.lineId)).toBe(false)
  })
})
