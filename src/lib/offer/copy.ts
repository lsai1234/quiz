/**
 * Every sentence the results page says about the offer (plan Phase 4): the
 * hero, the full stack and the free bonus. Scripted, one file, in the review
 * pack (`offerCopyRows`); nothing here is written by the AI, and nothing here
 * says what a product does. What a product does is only ever the register
 * claim the hero was approved to carry, verbatim, and why it is theirs is only
 * ever a goal line the goal-to-claim map backs (`heroReason`).
 *
 * The rules this wording keeps:
 *   - The hero is "Not the obvious pick". Never "transformational", never that
 *     most people haven't heard of it. With the hero switch off it is "Your
 *     top pick".
 *   - No pressure: no countdowns, no "only today", no "last chance".
 *   - Wherever "free" is said about the bonus, its conditions are said next to
 *     it (CAP Code 3.23–3.25), and the terms are one tap away.
 */
import { formatGBP } from '@/lib/stack-blueprint/pricing'

export const OFFER_COPY = {
  startHere: 'Start here',
  heroLabel: 'Not the obvious pick',
  topPickLabel: 'Your top pick',
  /** Under the name, when there is no goal line the map backs. */
  topPickFallback: (count: number) => `One of the ${count} products we picked for you.`,
  whatItDoes: 'What it does',
  whatYouGet: 'What you get',
  delivered: 'Delivered',
  startWithThis: 'Start with this',
  justThis: 'Just this product, no subscription. Pay on the next screen.',
  remote: (surcharge: number) => `Highlands, Islands and Isle of Man add ${formatGBP(surcharge)}.`,
  codeNotOnHero: 'Your code works on the full stack, not on this on its own.',

  fullStack: 'Or get the full stack',
  fullStackLine: (hero: string) => `Your ${hero} and the classics, at the depth you choose.`,
  moreFor: (difference: number, bonus: string) => `${formatGBP(difference)} more for the full stack and a free ${bonus}`,

  comesWith: (bonus: string) => `Comes with a free ${bonus}`,
  bonusReason: 'Chosen from our free gifts to suit your answers.',
  bonusFrom: (bonus: string, minimum: number) => `Free ${bonus} on stacks from ${formatGBP(minimum)}`,
  /** Next to every "free": the conditions, in a line. */
  bonusConditions: (minimum: number, firstOrderOnly: boolean) =>
    [firstOrderOnly ? 'First order only, one per customer.' : null, `Stacks from ${formatGBP(minimum)} before any discount.`, 'While stocks last.']
      .filter(Boolean)
      .join(' '),
  bonusOnSubscription: 'On a subscription, it comes in your first box only.',
  bonusNoCode: 'Doesn’t combine with a discount code.',
  terms: 'Free gift terms',
  tierGift: 'Gift',

  receiptFree: (product: string) => `Free: ${product}`,
  worth: (price: number) => `Worth ${formatGBP(price)}`,
  codeBeatsBonus: (bonus: string) => `Your code is worth more than the free ${bonus}, so you’ve got the code.`,
  bonusBeatsCode: (bonus: string) =>
    `Not applied: the free ${bonus} is worth more on this order, and codes don’t combine with the free gift. Remove the gift by choosing a smaller stack, or keep it.`,

  stickyHero: 'Start here',
  stickyHeroCta: 'Start with this →',
} as const

/** Where the terms live. */
export const FREE_GIFT_TERMS_PATH = '/legal/free-gift'
