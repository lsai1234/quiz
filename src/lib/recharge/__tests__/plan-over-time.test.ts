/**
 * Two years of one plan, box by box: what the hub says is coming is what ships.
 *
 * Every change goes the way the hub sends it: the hub's own helper on the
 * member's copy, then the server's `normaliseIncomingSubscription` deciding what
 * is kept. Before each box, the hub's "next box" is read off the calendar
 * (`buildDeliverySchedule`, which `/api/hub/next-box` and "What you have" read
 * too); on the plan's day, the order is raised the way the renewal webhook
 * raises it (`subscriptionOrderLines`) and the clock moves on (`advanceCycle`).
 * The two have to name the same products every month, through skips, a change
 * of how often, a product added and a whole box skipped.
 */
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import { MOCK_BLUEPRINT } from '@/lib/stack-blueprint/mock-blueprint'
import { addLine, buildMemberSubscription, setLineCadence } from '../mock'
import { buildDeliverySchedule, deliveryIdForCycle, skipDelivery, skipNextDelivery, upcomingBoxesForLine } from '../schedule'
import { advanceCycle } from '../clock'
import { normaliseIncomingSubscription } from '../reprice'
import { subscriptionOrderLines } from '@/lib/orders/service'
import type { MemberSubscription } from '../types'

const catalogue = MOCK_CATALOGUE
/** The plan starts on 15 January 2026; its day is the 15th. */
const START = new Date(2026, 0, 15, 12)
const dayIn = (cycle: number, day: number) => new Date(2026, cycle, day, 12)

/** A change made in the hub on a given day: the member's copy, then what the server keeps. */
function hubChange(sub: MemberSubscription, now: Date, change: (s: MemberSubscription) => MemberSubscription): MemberSubscription {
  const result = normaliseIncomingSubscription(sub, change(sub), catalogue, undefined, now)
  if (!result.ok) throw new Error(result.reason)
  return result.subscription
}

const titled = (sub: MemberSubscription, fragment: string) => sub.lines.find((l) => l.productTitle.includes(fragment))!

describe('a plan over two years', () => {
  let sub = buildMemberSubscription(MOCK_BLUEPRINT, catalogue, 'member@example.com', null, { now: START })
  const shipped: string[][] = []
  const shown: string[][] = []
  const credits: number[] = []

  /** Changes the member makes after a box has gone, before the next. */
  const changesAfter: Record<number, (s: MemberSubscription, now: Date) => MemberSubscription> = {
    // Skip the next creatine (due in cycles 0, 3, 6…): it comes out of cycle 6.
    4: (s, now) => hubChange(s, now, (x) => skipNextDelivery(x, titled(x, 'Creatine').id, now)),
    // Whey every month → every 2 months. Its last was cycle 7, so cycles 9, 11, 13…
    7: (s, now) => hubChange(s, now, (x) => setLineCadence(x, titled(x, 'Whey').id, 2, undefined, now)),
    // Add a quarterly product: its first box is the next one, cycle 10.
    9: (s, now) => {
      const zinc = catalogue.find((p) => p.title.includes('Vitamin C + Zinc'))!
      return hubChange(s, now, (x) => addLine(x, zinc, catalogue))
    },
    // Skip the whole of box 14.
    13: (s, now) => hubChange(s, now, (x) => skipDelivery(x, deliveryIdForCycle(x, 14)!)),
    // Pre-workout every 3 months → every month. Its last was cycle 15, so 16, 17, 18…
    15: (s, now) => hubChange(s, now, (x) => setLineCadence(x, titled(x, 'Pre-Workout').id, 1, undefined, now)),
    // And back to every 3. Its last was cycle 19, so 22.
    19: (s, now) => hubChange(s, now, (x) => setLineCadence(x, titled(x, 'Pre-Workout').id, 3, undefined, now)),
  }

  beforeAll(() => {
    for (let cycle = 1; cycle <= 24; cycle++) {
      const change = changesAfter[cycle - 1]
      if (change) {
        const before = sub.lines.reduce((t, l) => t + (l.pendingCredit ?? 0), 0)
        sub = change(sub, dayIn(cycle - 1, 20))
        credits[cycle - 1] = Math.round((sub.lines.reduce((t, l) => t + (l.pendingCredit ?? 0), 0) - before) * 100) / 100
      }
      // Five days after the last box went, the next box is this one, not the one
      // that has gone (it used to be, for the second half of every month).
      const [afterLast] = buildDeliverySchedule(sub, catalogue, 1, dayIn(cycle - 1, 20))
      expect(afterLast.id).toBe(deliveryIdForCycle(sub, cycle))
      const boxDay = new Date(afterLast.date)
      expect([boxDay.getFullYear(), boxDay.getMonth(), boxDay.getDate()]).toEqual([
        new Date(2026, cycle, 1).getFullYear(),
        new Date(2026, cycle, 1).getMonth(),
        15,
      ])
      // Three days before the box: the hub's next box.
      const [next] = buildDeliverySchedule(sub, catalogue, 1, dayIn(cycle, 12))
      expect(next.id).toBe(deliveryIdForCycle(sub, cycle))
      shown[cycle] = next.status === 'skipped' ? [] : next.items.filter((i) => !i.oneOff).map((i) => i.productTitle).sort()
      // The plan's day: the order the renewal raises.
      shipped[cycle] = subscriptionOrderLines(sub, catalogue, cycle).map((l) => l.title).sort()
      sub = advanceCycle(sub)
    }
  })

  it('ships exactly what the hub said was coming, every month', () => {
    for (let cycle = 1; cycle <= 24; cycle++) expect({ cycle, items: shown[cycle] }).toEqual({ cycle, items: shipped[cycle] })
  })

  const has = (cycle: number, fragment: string) => shipped[cycle].some((t) => t.includes(fragment))
  const cyclesWith = (fragment: string) => Array.from({ length: 24 }, (_, i) => i + 1).filter((c) => has(c, fragment))

  it('really skips a skipped product, credits it once, and carries on as normal', () => {
    expect(cyclesWith('Creatine')).toEqual([3, 9, 12, 15, 18, 21, 24])
    expect(credits[4]).toBeGreaterThan(0)
    expect(credits[4]).toBe(titled(sub, 'Creatine').pricePerDelivery)
  })

  it('counts a change of how often from the last delivery, with no extra box and no gap', () => {
    expect(cyclesWith('Whey')).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 11, 13, 15, 17, 19, 21, 23])
    // A tub that lasts 2½ months comes in the box before it runs out (2, 5, 7,
    // 10, 12, 15); every month from its last (15), then every 3 from its last (19).
    expect(cyclesWith('Pre-Workout')).toEqual([2, 5, 7, 10, 12, 15, 16, 17, 18, 19, 22])
  })

  it('never runs out of a product left on its own rhythm, and never piles it up', () => {
    // Electrolytes last 2½ months at three training days a week, and nobody touches them.
    const lasts = titled(sub, 'Electrolyte').lastsMonths!
    expect(lasts).toBeCloseTo(2.5, 2)
    let supply = lasts // the tub in the box at signup
    for (let cycle = 1; cycle <= 24; cycle++) {
      // Just before this box arrives, a month more has been used.
      expect({ cycle, left: Math.round((supply - cycle) * 100) / 100 }).toEqual({ cycle, left: expect.any(Number) })
      expect(supply - cycle).toBeGreaterThanOrEqual(-0.01)
      if (has(cycle, 'Electrolyte')) supply += lasts
      // Never more than one tub and a month ahead.
      expect(supply - cycle).toBeLessThanOrEqual(lasts + 1)
    }
  })

  it('sends a product added mid-plan in the next box, then on its cadence', () => {
    expect(cyclesWith('Zinc')).toEqual([10, 13, 16, 19, 22])
  })

  it('sends nothing in a skipped box', () => {
    expect(shipped[14]).toEqual([])
  })

  it('says when a product comes next the way it then ships', () => {
    // From the end of the run: what the product sheet would say next.
    const whey = titled(sub, 'Whey')
    const [first, second] = upcomingBoxesForLine(sub, whey.id, 2, dayIn(24, 20))
    expect([first.cycle, second.cycle]).toEqual([25, 27])
  })
})
