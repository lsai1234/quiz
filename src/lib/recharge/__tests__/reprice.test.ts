/**
 * The money on a subscription is the server's, not the browser's.
 *
 * `PUT /api/hub/subscription` accepts a whole `MemberSubscription` from the
 * client — a deliberate design, and fine for everything except the figures that
 * decide what someone pays. Each test below is a hand-written PUT that used to
 * work.
 */
import { normaliseIncomingSubscription } from '../reprice'
import { createMockSubscription, flatMonthlyOf } from '../mock'
import { skipNextDelivery } from '../schedule'
import { shipsAtCycle } from '../clock'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { MemberSubscription } from '../types'

const catalogue = MOCK_CATALOGUE
const base = () => createMockSubscription(catalogue, 'member@example.com')

/** The client's document, with something rewritten. */
function claim(sub: MemberSubscription, patch: Partial<MemberSubscription>): MemberSubscription {
  return { ...sub, ...patch }
}

function ok(result: ReturnType<typeof normaliseIncomingSubscription>) {
  if (!result.ok) throw new Error(`expected a priced subscription, got: ${result.reason}`)
  return result.subscription
}

describe('what the browser may not change', () => {
  it('ignores a monthly total the member typed for themselves', () => {
    const previous = base()
    const priced = ok(normaliseIncomingSubscription(previous, claim(previous, { flatMonthly: 1.23 }), catalogue))
    expect(priced.flatMonthly).toBe(previous.flatMonthly)
  })

  it('re-prices lines whose per-delivery price was rewritten', () => {
    const previous = base()
    const cheapened = claim(previous, {
      lines: previous.lines.map((l) => ({ ...l, pricePerDelivery: 0.5 })),
    })
    const priced = ok(normaliseIncomingSubscription(previous, cheapened, catalogue))

    for (const [i, line] of priced.lines.entries()) {
      expect(line.pricePerDelivery).toBeCloseTo(previous.lines[i].pricePerDelivery, 2)
    }
    expect(priced.flatMonthly).toBe(previous.flatMonthly)
  })

  it('keeps the subscribe-and-save rate the member signed up on', () => {
    const previous = base()
    const greedy = claim(previous, { subscriptionDiscountRate: 0.95 })
    expect(ok(normaliseIncomingSubscription(previous, greedy, catalogue)).subscriptionDiscountRate)
      .toBe(previous.subscriptionDiscountRate)
  })

  it('clamps a stretched cadence to the configured maximum', () => {
    const previous = base()
    const stretched = claim(previous, {
      lines: previous.lines.map((l) => ({ ...l, deliveryIntervalMonths: 60 })),
    })
    const priced = ok(normaliseIncomingSubscription(previous, stretched, catalogue))
    for (const line of priced.lines) expect(line.deliveryIntervalMonths).toBeLessThanOrEqual(3)
  })

  it('clamps units per delivery to the hub’s own limit', () => {
    const previous = base()
    const greedy = claim(previous, { lines: previous.lines.map((l) => ({ ...l, quantity: 999 })) })
    const priced = ok(normaliseIncomingSubscription(previous, greedy, catalogue))
    for (const line of priced.lines) expect(line.quantity).toBeLessThanOrEqual(6)
  })

  it('refuses a plan carrying a product we do not sell', () => {
    const previous = base()
    const invented = claim(previous, {
      lines: [{ ...previous.lines[0], id: 'line-new', productId: 'not-a-real-product' }],
    })
    const result = normaliseIncomingSubscription(previous, invented, catalogue)
    expect(result.ok).toBe(false)
  })

  it('will not let a member erase what has already shipped', () => {
    const previous = base()
    expect(previous.lines[0].deliveriesMade).toBeGreaterThan(0)
    const wiped = claim(previous, { lines: previous.lines.map((l) => ({ ...l, deliveriesMade: 0 })) })
    const priced = ok(normaliseIncomingSubscription(previous, wiped, catalogue))
    expect(priced.lines[0].deliveriesMade).toBe(previous.lines[0].deliveriesMade)
  })
})

describe('skip credits', () => {
  it('refuses a credit the member awarded themselves', () => {
    const previous = base()
    const rich = claim(previous, { lines: previous.lines.map((l) => ({ ...l, pendingCredit: 500 })) })
    const priced = ok(normaliseIncomingSubscription(previous, rich, catalogue))
    for (const line of priced.lines) expect(line.pendingCredit).toBe(0)
  })

  /*
    A skip takes the product out of its next box (`skipNextDelivery`), and the
    credit is worked out from that box on the server. It used to be read off the
    line's `nextShipAt` moving later, which nothing that ships reads: the member
    was credited and the product came anyway.
  */
  const NOW = new Date(2026, 10, 26, 12)
  const plan = () => createMockSubscription(catalogue, 'member@example.com', null, NOW)
  const firstLine = (sub: MemberSubscription) => sub.lines[0]

  it('allows exactly one delivery’s value when the product really comes out of its next box', () => {
    const previous = plan()
    const line = firstLine(previous)
    const skipped = skipNextDelivery(previous, line.id, NOW)
    const priced = ok(normaliseIncomingSubscription(previous, skipped, catalogue, undefined, NOW))
    expect(priced.lines[0].pendingCredit).toBeCloseTo(line.pricePerDelivery, 2)
  })

  it('caps an inflated credit at the value of the delivery skipped', () => {
    const previous = plan()
    const line = firstLine(previous)
    const skipped = skipNextDelivery(previous, line.id, NOW)
    const greedy = { ...skipped, lines: skipped.lines.map((l) => (l.id === line.id ? { ...l, pendingCredit: 500 } : l)) }
    const priced = ok(normaliseIncomingSubscription(previous, greedy, catalogue, undefined, NOW))
    expect(priced.lines[0].pendingCredit).toBeCloseTo(line.pricePerDelivery, 2)
  })

  it('credits nothing for moving `nextShipAt`, which nothing ships by', () => {
    const previous = plan()
    const line = firstLine(previous)
    const later = new Date(NOW)
    later.setMonth(later.getMonth() + 2)
    const moved = claim(previous, {
      lines: previous.lines.map((l) => (l.id === line.id ? { ...l, nextShipAt: later.toISOString(), pendingCredit: l.pricePerDelivery } : l)),
    })
    const priced = ok(normaliseIncomingSubscription(previous, moved, catalogue, undefined, NOW))
    expect(priced.lines[0].pendingCredit).toBe(0)
  })

  it('credits nothing for a box that has already gone, or one the product was not due in', () => {
    const previous = plan()
    const quarterly = previous.lines.find((l) => l.deliveryIntervalMonths === 3)!
    const pulled = (id: string) =>
      claim(previous, {
        deliveryOverrides: { [id]: { removedLineIds: [quarterly.id] } },
        lines: previous.lines.map((l) => (l.id === quarterly.id ? { ...l, pendingCredit: l.pricePerDelivery } : l)),
      })
    const credited = (id: string) =>
      ok(normaliseIncomingSubscription(previous, pulled(id), catalogue, undefined, NOW)).lines.find((l) => l.id === quarterly.id)!.pendingCredit
    // This month's box went on the plan's day (the plan started on the 26th, two months ago).
    expect(credited('2026-11')).toBe(0)
    // December is cycle 3, when the quarterly tub is due; January isn't.
    expect(credited('2026-12')).toBeCloseTo(quarterly.pricePerDelivery, 2)
    expect(credited('2027-01')).toBe(0)
  })

  it('credits nothing for a product taken out of a box that is already skipped (the box was credited whole)', () => {
    const previous = { ...plan(), deliveryOverrides: { '2026-12': { skipped: true } } }
    const line = firstLine(previous)
    const pulled = claim(previous, {
      deliveryOverrides: { '2026-12': { skipped: true, removedLineIds: [line.id] } },
      lines: previous.lines.map((l) => (l.id === line.id ? { ...l, pendingCredit: l.pricePerDelivery } : l)),
    })
    expect(ok(normaliseIncomingSubscription(previous, pulled, catalogue, undefined, NOW)).lines[0].pendingCredit).toBe(0)
  })

  it('keeps a credited product out of its box: putting it back would ship it and keep the credit', () => {
    const previous = plan()
    const line = firstLine(previous)
    const skipped = ok(normaliseIncomingSubscription(previous, skipNextDelivery(previous, line.id, NOW), catalogue, undefined, NOW))
    const [boxId] = Object.keys(skipped.deliveryOverrides ?? {})
    const putBack = claim(skipped, { deliveryOverrides: { [boxId]: { removedLineIds: [] } } })
    const priced = ok(normaliseIncomingSubscription(skipped, putBack, catalogue, undefined, NOW))
    expect(priced.deliveryOverrides?.[boxId]?.removedLineIds).toContain(line.id)
  })
})

describe('when things ship is the server’s too', () => {
  const NOW = new Date(2026, 10, 26, 12)
  const plan = () => createMockSubscription(catalogue, 'member@example.com', null, NOW)
  const months = (line: MemberSubscription['lines'][number], from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((c) => shipsAtCycle(line, c))

  it('leaves every product’s months alone on a save that changes something else', () => {
    // Lines made at checkout carry no `joinedAtMonth`. Any save used to stamp the
    // current month on them, so a tub due in month 3 came in month 5.
    const previous = plan()
    const tub = previous.lines.find((l) => l.deliveryIntervalMonths === 3)!
    const priced = ok(normaliseIncomingSubscription(previous, claim(previous, { defaultChangePolicy: 'remove' }), catalogue, undefined, NOW))
    const after = priced.lines.find((l) => l.id === tub.id)!
    expect(months(after, 0, 9)).toEqual(months(tub, 0, 9))
    expect(months(after, 0, 9)).toEqual([0, 3, 6, 9])
  })

  it('puts a new product in the next box, and counts no delivery before it', () => {
    const previous = plan() // two months in: the next box is cycle 3
    const product = catalogue.find((p) => p.subscriptionEligible && !previous.lines.some((l) => l.productId === p.id))!
    const added = claim(previous, {
      lines: [...previous.lines, { ...previous.lines[0], id: 'line-added', productId: product.id, productTitle: product.title, deliveryIntervalMonths: 3, joinedAtMonth: 0 }],
    })
    const line = ok(normaliseIncomingSubscription(previous, added, catalogue, undefined, NOW)).lines.find((l) => l.id === 'line-added')!
    expect(months(line, 0, 9)).toEqual([3, 6, 9])
  })

  it('counts a change of how often from the last delivery, whatever the browser sends', () => {
    const previous = plan()
    const monthly = previous.lines.find((l) => l.deliveryIntervalMonths === 1)!
    // Every month → every 3 months, two months in: the last one was in cycle 2.
    // A browser that also sends its own timing (to get a tub in every box) is ignored.
    const changed = claim(previous, {
      lines: previous.lines.map((l) => (l.id === monthly.id ? { ...l, deliveryIntervalMonths: 3, cadenceFrom: { cycle: 3, made: 0, last: 0 }, joinedAtMonth: 3 } : l)),
    })
    const line = ok(normaliseIncomingSubscription(previous, changed, catalogue, undefined, NOW)).lines.find((l) => l.id === monthly.id)!
    expect(months(line, 3, 11)).toEqual([5, 8, 11])
    expect(line.cadenceFrom).toEqual({ cycle: 5, made: 3, last: 2 })
  })
})

describe('what the browser may still do', () => {
  it('drops a line, and the monthly falls by that line’s share', () => {
    const previous = base()
    const kept = previous.lines.slice(1)
    const priced = ok(normaliseIncomingSubscription(previous, claim(previous, { lines: kept }), catalogue))
    expect(priced.lines).toHaveLength(kept.length)
    expect(priced.flatMonthly).toBe(flatMonthlyOf(priced.lines))
    expect(priced.flatMonthly).toBeLessThan(previous.flatMonthly)
  })

  it('adds a product, priced from the catalogue rather than from the request', () => {
    const previous = base()
    const product = catalogue.find((p) => !previous.lines.some((l) => l.productId === p.id))!
    const added = claim(previous, {
      lines: [
        ...previous.lines,
        { ...previous.lines[0], id: 'line-added', productId: product.id, productTitle: product.title, quantity: 1, pricePerDelivery: 0.01 },
      ],
    })
    const priced = ok(normaliseIncomingSubscription(previous, added, catalogue))
    const line = priced.lines.find((l) => l.id === 'line-added')!
    expect(line.pricePerDelivery).toBeGreaterThan(1)
    expect(priced.flatMonthly).toBeGreaterThan(previous.flatMonthly)
  })

  it('keeps a grandfathered price rather than resetting it to today’s catalogue', () => {
    /* When a substitution costs more, `changes/apply.ts` holds the member at the
       old figure and absorbs the difference. Re-pricing everything from the
       catalogue on each save would undo that silently — a security fix turning
       into a price rise. */
    const previous = base()
    const held = {
      ...previous,
      lines: previous.lines.map((l, i) => (i === 0 ? { ...l, pricePerDelivery: l.pricePerDelivery / 2 } : l)),
    }
    const priced = ok(normaliseIncomingSubscription(held, held, catalogue))
    expect(priced.lines[0].pricePerDelivery).toBeCloseTo(held.lines[0].pricePerDelivery, 2)
  })

  it('leaves the monthly alone when a save changes nothing about the plan', () => {
    const previous = base()
    const unrelated = claim(previous, { dispatchDayOfMonth: 20 })
    const priced = ok(normaliseIncomingSubscription(previous, unrelated, catalogue))
    expect(priced.flatMonthly).toBe(previous.flatMonthly)
    expect(priced.dispatchDayOfMonth).toBe(20)
  })
})
