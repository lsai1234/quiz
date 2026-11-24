/**
 * Changing the day a stack guide is built around ("Set your day" in the hub).
 *
 * A guide times each product around someone's day: when they wake, when they
 * go to bed, when and on which days they train. Where they never said (a quiz
 * that asks when they train but not when they sleep, a shop plan that asks
 * nothing), the day is assumed, and until now there was no way to correct it:
 * the guide would say 7:30am to someone who gets up at 5.
 *
 * This rebuilds the guide's routine on the day they give, from the same rules
 * that built it (`routineFor`), and keeps everything that isn't about the day:
 * the products, how much of each, the claims and warnings, the guide's link.
 * Pure; the route saves it.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { normaliseDay, routineFor, type RoutineDay } from '@/lib/routine'
import { spokenClock } from '@/lib/routine/ring'
import type { StackGuide } from './build'

export function guideWithDay(guide: StackGuide, raw: unknown, catalogue: readonly CatalogueProduct[]): StackGuide {
  // Theirs now, not assumed.
  const day: RoutineDay = { ...normaliseDay(raw), assumed: false }
  const products = guide.products
    .map((g) => catalogue.find((p) => p.id === g.id))
    .filter((p): p is CatalogueProduct => Boolean(p))
  const fresh = routineFor(products, day)
  // How much of each is about the product, not the day: keep the guide's own.
  const amountOf = new Map(guide.routine.items.map((i) => [i.productId, i.amount]))
  const items = fresh.items.map((i) => ({ ...i, amount: amountOf.get(i.productId) ?? i.amount }))
  const byId = new Map(items.map((i) => [i.productId, i]))
  return {
    ...guide,
    routine: {
      day,
      items,
      moments: fresh.moments.map((m) => ({ ...m, items: m.items.map((i) => byId.get(i.productId) ?? i) })),
    },
    products: guide.products.map((g) => {
      const item = byId.get(g.id)
      return item ? { ...g, time: item.minutes === null ? null : spokenClock(item.minutes), moment: item.moment, daysLabel: item.daysLabel, amount: item.amount } : g
    }),
  }
}
