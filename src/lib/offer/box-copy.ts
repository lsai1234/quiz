/**
 * The words on "Your box" (the clarity pass, part 2): the selection that
 * replaced Essentials / Standard / Complete. Scripted, one file, in the review
 * pack (`boxCopyRows`). Nothing here says what a product does: a row's reason
 * is the consult's claims-aware reason or the quiz's "Built from your answers"
 * line, both already through the claims maps. Where neither may be said, the
 * row says only that the answers picked it (`picked`), and Details has the
 * rest.
 */
import { formatGBP } from '@/lib/stack-blueprint/pricing'

export const BOX_COPY = {
  heading: 'Your box',
  sub: 'Amp picked these for you. Switch any off, or add more.',
  countOn: (on: number, all: number) => `${on} of ${all} on`,
  /** A row's reason when no approved line may be said beside the product. */
  picked: 'Picked from your answers',
  /** A row they added themselves. */
  added: 'You added this',
  /** The switch's name for a screen reader. */
  switchLabel: (product: string) => `${product} in your box`,
  details: 'Details',
  empty: 'Switch on at least one product to make your box.',
  ctaOnce: (total: number) => `Get my box · ${formatGBP(total)}`,
  ctaMonthly: (monthly: number) => `Start monthly · ${formatGBP(monthly)} a month`,
  going: 'Taking you to secure checkout…',
  /** Under the button: the button's price is the goods, as the receipt's total is. */
  delivery: (charge: number) => (charge > 0 ? `+${formatGBP(charge)} delivery` : 'Free delivery included'),
  justOne: (product: string, total: number) => `Just want one? Start with the ${product} · ${formatGBP(total)} delivered`,
  /** The monthly option's badge: the same rate the line under the choice says. */
  monthlyBadge: (pct: number) => `${pct}% off`,
  /** Monthly, while the box is under the subscription minimum (the option, then the line under it). */
  monthlyFrom: (min: number) => `From ${formatGBP(min)} a month`,
  monthlyMin: (min: number, now: number) =>
    `Monthly starts at ${formatGBP(min)} a month, and this box comes to ${formatGBP(now)}. Switch on another product to choose it.`,
  /** The receipt's subscribe-and-save row. */
  receiptSave: (n: number) => `Your box · ${n} product${n === 1 ? '' : 's'} · Subscribe & Save`,
  /** The sticky bar, following the box. */
  stickyOnce: 'Your box · one-off',
  stickyMonthly: 'Your box · monthly',
  /** The rest of their read, folded under the box. */
  more: 'More from your answers',
  less: 'Show less',
} as const
