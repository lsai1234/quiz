/**
 * The two ways to buy a stack, in plain words (the clarity pass): what each
 * one is, and why their prices differ. Scripted, one file, in the review pack
 * (`planCopyRows`). Nothing here is written by the AI, and nothing here says
 * what a product does.
 *
 * ── Why the prices differ, and why that confused people ──────────────────────
 * "£72.21 a month, or £87.35 once" reads as two prices for one thing. They are
 * prices for two different things:
 *
 *   just once        one pack of each, and packs last different times (a
 *                    multivitamin a month, an omega-3 three)
 *   keep me stocked  one flat monthly payment that sends each product as it
 *                    runs out; packs that last longer than a month are paid
 *                    off over the months they last
 *
 * So the monthly figure is usually lower than one of everything, and higher
 * only when someone gets through a product faster than a pack a month (their
 * monthly box has more in it). `whyPricesDiffer` says which, from the plan's
 * own figures (`planComparison`), never from a sentence written in advance.
 */
import { formatGBP, type PlanComparison } from '@/lib/stack-blueprint/pricing'

export const PLAN_COPY = {
  heading: 'How do you want it?',
  monthly: 'Keep me stocked',
  once: 'Just this once',
  aMonth: 'a month',
  oneOfEach: 'one of each',
  /** Under the switch, for the plan chosen. */
  monthlyLine: (pct: number) => `Each product arrives as you’re about to run out. ${pct}% off, no minimum term.`,
  onceLine: 'One pack of each, delivered. Nothing after that.',
  /** On a depth that can't be a subscription. */
  onceOnly: 'One-off only',
  why: 'Why are the prices different?',
  /** In "Your offer": the full stack's two prices, each saying what it buys. */
  summaryMonthly: (monthly: number, pct: number) => `${formatGBP(monthly)} a month to keep you stocked (${pct}% off)`,
  summaryOnce: (oneOff: number) => `or ${formatGBP(oneOff)} for one pack of each`,
} as const

/** "about a month", "about six weeks", "about three months". */
export function aboutMonths(n: number): string {
  if (n < 1.25) return 'about a month'
  if (n < 1.75) return 'about six weeks'
  const whole = Math.round(n)
  const word = ['', '', 'two', 'three', 'four', 'five', 'six'][whole] ?? String(whole)
  return `about ${word} months`
}

/**
 * Why "a month" and "once" are different numbers, for this stack: what one
 * pack of each lasts, what the monthly plan does instead, and (when it is so)
 * what the same supply would cost a month bought one-off. Each sentence only
 * when the figures make it true.
 */
export function whyPricesDiffer(c: PlanComparison, monthlyPct: number): string[] {
  const lines: string[] = []
  const spread = c.longestLasting && c.lastsMonths > c.runsOutMonths + 0.5
  lines.push(
    `“Just this once” is one pack of each, and packs last different times: your ${c.firstToRunOut} ${aboutMonths(c.runsOutMonths)}` +
      (spread ? `, your ${c.longestLasting} ${aboutMonths(c.lastsMonths)}.` : '.'),
  )
  lines.push(
    `“Keep me stocked” is one flat monthly payment that sends each product as you run out, ${monthlyPct}% off. Packs that last longer than a month are spread over the months they last.`,
  )
  if (!c.firstDeliveryIdentical) lines.push('You get through some of it faster than a pack a month, so your monthly box has more in it than one of each.')
  if (c.perMonthSaving > 0.5) {
    lines.push(`The same supply bought one-off would cost about ${formatGBP(c.oneOffPerMonth)} a month, so keeping stocked saves about ${formatGBP(c.perMonthSaving)} a month.`)
  }
  return lines
}
