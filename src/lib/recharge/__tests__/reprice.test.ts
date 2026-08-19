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

  it('allows exactly one delivery’s value when the delivery actually moved', () => {
    const previous = base()
    const line = previous.lines[0]
    const later = new Date(line.nextShipAt ?? Date.now())
    later.setMonth(later.getMonth() + 1)

    const skipped = claim(previous, {
      lines: previous.lines.map((l) =>
        l.id === line.id
          ? { ...l, nextShipAt: later.toISOString(), pendingCredit: l.pricePerDelivery }
          : l,
      ),
    })
    const priced = ok(normaliseIncomingSubscription(previous, skipped, catalogue))
    expect(priced.lines[0].pendingCredit).toBeCloseTo(line.pricePerDelivery, 2)
  })

  it('caps an inflated credit at the value of the delivery skipped', () => {
    const previous = base()
    const line = previous.lines[0]
    const later = new Date(line.nextShipAt ?? Date.now())
    later.setMonth(later.getMonth() + 1)

    const greedy = claim(previous, {
      lines: previous.lines.map((l) =>
        l.id === line.id ? { ...l, nextShipAt: later.toISOString(), pendingCredit: 500 } : l,
      ),
    })
    const priced = ok(normaliseIncomingSubscription(previous, greedy, catalogue))
    expect(priced.lines[0].pendingCredit).toBeCloseTo(line.pricePerDelivery, 2)
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
