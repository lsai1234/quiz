/**
 * Your box (the clarity pass, part 2): the stack as a selection, not three
 * sizes. Every product Amp recommends is listed; each is switched on or off.
 * Pure: the page holds which are on.
 *
 *   The list       the deepest stack the quiz built (both quizzes), in its
 *                  order, plus anything the person adds themselves.
 *   Starting box   the first products in that order while the box stays at or
 *                  under `BOX_START_MAX` at list price, always at least one:
 *                  a box nobody chose should never open at £100. £50 is
 *                  about what the old Essentials cost and, on the shop's
 *                  prices, two or three products. When only the first fits,
 *                  the next that keeps it under £60 joins it (`BOX_PAIR_MAX`).
 *   Level          the existing three subscribe-and-save rates, now set by how
 *                  many products are on (`levelForCount`), so a bigger box
 *                  earns a better monthly rate. The rates themselves, the
 *                  margin floor and the server's checks are unchanged: the
 *                  level is still sent with the order and re-checked there.
 *
 * A partner's free starter box keeps its sizes: the free stack has to stay
 * under its goods cap, which the sizes enforce (`STARTER_GOODS_CAP`).
 */
import type { StackLevel } from '@/lib/types'

/** The starting box, at most this at list price (£), unless its first product alone costs more. */
export const BOX_START_MAX = 50
/**
 * A box of one is not a box: when only the first product fits under
 * `BOX_START_MAX`, the next one in order that keeps it at or under this goes
 * in too. A first product dear enough to leave no such room stays alone, so a
 * box nobody chose still never opens near £100.
 */
export const BOX_PAIR_MAX = 60

/** From this many products on, the box takes the next monthly rate. */
export const LEVEL_FROM: readonly { level: StackLevel; count: number }[] = [
  { level: 'essentials', count: 1 },
  { level: 'performance', count: 4 },
  { level: 'complete', count: 6 },
]

/** The subscribe-and-save level for a box of `n` products. */
export function levelForCount(n: number): StackLevel {
  let level: StackLevel = 'essentials'
  for (const step of LEVEL_FROM) if (n >= step.count) level = step.level
  return level
}

/** The next level up from a box of `n`, and how many more products reach it; null at the top. */
export function nextLevel(n: number): { level: StackLevel; more: number } | null {
  const step = LEVEL_FROM.find((s) => s.count > n)
  return step ? { level: step.level, more: step.count - n } : null
}

/**
 * The starting box: products in order while the running list-price total
 * stays at or under `max`. The first always goes in, so there is a box; after
 * that a product that would break the ceiling is left off and the next tried.
 */
export function startingBox(items: readonly { id: string; price: number }[], max = BOX_START_MAX, pairMax = BOX_PAIR_MAX): string[] {
  const on: string[] = []
  let total = 0
  for (const item of items) {
    if (on.length > 0 && total + item.price > max + 0.005) continue
    on.push(item.id)
    total += item.price
  }
  if (on.length === 1) {
    const second = items.find((i) => i.id !== on[0] && total + i.price <= pairMax + 0.005)
    if (second) on.push(second.id)
  }
  // Back in the list's own order.
  return items.filter((i) => on.includes(i.id)).map((i) => i.id)
}

/**
 * Which products are on: the person's own choices where they made them, the
 * starting box where they haven't. A product that is no longer listed drops
 * out; one they added themselves comes in on.
 */
export function boxOn(listed: readonly string[], start: readonly string[], chosen: { on: readonly string[]; off: readonly string[] }): string[] {
  const off = new Set(chosen.off)
  const on = new Set(chosen.on)
  return listed.filter((id) => on.has(id) || (start.includes(id) && !off.has(id)))
}
