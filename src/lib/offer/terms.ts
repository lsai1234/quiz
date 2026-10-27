/**
 * The free gift's terms, as customers read them (plan Phase 4). DRAFT for
 * review: nothing here is live until the bonus is (`BONUS_AT_CHECKOUT`), and
 * the founders and whoever reviews the pack sign the wording off first.
 *
 * Built from the hub's settings, so a minimum or a depth changed there is the
 * minimum or depth the terms state. In the review pack (`bonusTermRows`).
 */
import { formatGBP } from '@/lib/stack-blueprint/pricing'
import { LEVEL_NAME } from './bonus-economics'
import { STACK_LEVELS, type BonusSettings } from './settings'

export interface TermsSection {
  heading: string
  lines: string[]
}

export function freeGiftTerms(bonus: BonusSettings): TermsSection[] {
  const tiers = STACK_LEVELS.filter((t) => bonus.tiers.includes(t)).map((t) => LEVEL_NAME[t])
  return [
    {
      heading: 'Who it’s for',
      lines: [
        bonus.firstOrderOnly
          ? 'Your first order with us only, and one free gift per customer. We check by account, email address, payment card and delivery address.'
          : 'Any order that meets these terms, one free gift per order.',
        `Stacks only: ${tiers.length ? tiers.join(', ') : 'no'} stacks from the quiz or the Amp Consult. Not a single product bought on its own, and not a shop basket.`,
      ],
    },
    {
      heading: 'What you need to spend',
      lines: [`Stacks from ${formatGBP(bonus.minSubtotal)}, before any discount. Delivery doesn’t count towards it.`],
    },
    {
      heading: 'What it costs you',
      lines: [
        'Nothing. The gift never makes your stack cost more, never makes your stack saving smaller and never adds a delivery charge. It shows on your receipt as a £0.00 line.',
        'Which gift you get is chosen from the products we’re giving away at the time, to suit your answers. You can’t swap it for cash or for another product.',
      ],
    },
    {
      heading: 'Discount codes',
      lines: [
        bonus.codes === 'better-of'
          ? 'The gift doesn’t combine with a discount code. You get whichever is worth more on your order, and your receipt says which.'
          : 'The gift doesn’t combine with a discount code. Using a code means no gift.',
      ],
    },
    {
      heading: 'Subscriptions',
      lines: ['On a subscription, the gift comes in your first box only. Later boxes don’t include it.'],
    },
    {
      heading: 'While stocks last',
      lines: [
        'If your gift sells out before you pay, we tell you before any money is taken. If it sells out after you’ve paid, we send your order without it and tell you by email; the gift was free, so there is nothing to refund for it.',
      ],
    },
    {
      heading: 'Returns',
      lines: [
        'If you return your stack, you don’t need to send the gift back, and nothing is taken off your refund for it.',
        'If you return part of your stack and what you keep is under the minimum spend, you keep the gift; we don’t charge you for it.',
      ],
    },
    {
      heading: 'Changes',
      lines: ['We can end or change the free gift at any time. That never affects an order you’ve already placed.'],
    },
  ]
}
