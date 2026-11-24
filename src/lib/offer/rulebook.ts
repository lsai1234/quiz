/**
 * Which offers apply where: one table, for the founders and for the code.
 *
 * The offers grew up one at a time, each with its own rule in its own file:
 * partner codes in `partners/redeem`, founder codes in `founder-codes/redeem`,
 * the free gift in `offer/checkout-bonus`, the plan savings in `pricing`, the
 * shop's monthly basket in `checkout/shop-plan`. Each rule was right, and nobody
 * could see them side by side, so copy on one page promised what another page's
 * rule refused.
 *
 * This is them side by side. It decides nothing at runtime: the rules still
 * live where they are enforced. What keeps the two together is
 * `__tests__/rulebook.test.ts`, which checks every cell here against the
 * function that enforces it, so the table cannot drift from what happens at
 * checkout. The setup guide prints it.
 *
 * "When on" means the offer exists only while the founders have switched it on
 * in the Founders Hub (named in `switch`); off, nothing anywhere mentions it.
 */

/** The ways someone buys from us. */
export type BuyChannel =
  /** The shop, one at a time. */
  | 'shop-once'
  /** The shop's basket, every month (`checkout/shop-plan`). */
  | 'shop-monthly'
  /** A stack from the quiz or the Amp Consult, bought once. */
  | 'stack-once'
  /** A stack from the quiz or the Amp Consult, or a bundle, every month. */
  | 'stack-monthly'
  /** The member hub's top-up box. */
  | 'hub-top-up'

export const BUY_CHANNELS: readonly BuyChannel[] = ['shop-once', 'shop-monthly', 'stack-once', 'stack-monthly', 'hub-top-up']

export const CHANNEL_LABEL: Record<BuyChannel, string> = {
  'shop-once': 'Shop, once',
  'shop-monthly': 'Shop basket, monthly',
  'stack-once': 'Quiz or consult stack, once',
  'stack-monthly': 'Quiz, consult or bundle plan',
  'hub-top-up': 'Hub top-up box',
}

export type OfferId =
  | 'partner-code'
  | 'store-code'
  | 'founder-code'
  | 'basket-tier'
  | 'plan-saving'
  | 'first-month'
  | 'free-gift'
  | 'member-prices'
  | 'guarantee'

export interface OfferRule {
  id: OfferId
  name: string
  /** Where it works. */
  channels: Record<BuyChannel, boolean>
  /** The Founders Hub switch it needs, or null for one that is always there. */
  switch: string | null
  /** The one thing to know about it. */
  note: string
}

const only = (...on: BuyChannel[]): Record<BuyChannel, boolean> =>
  Object.fromEntries(BUY_CHANNELS.map((c) => [c, on.includes(c)])) as Record<BuyChannel, boolean>

export const OFFER_RULES: readonly OfferRule[] = [
  {
    id: 'partner-code',
    name: 'Partner codes',
    channels: only('stack-once', 'stack-monthly', 'shop-monthly'),
    switch: null,
    note: 'Refused on single products bought once from the shop; a partner’s link still earns them the referral there. On a plan it comes off the first payment only (its rate off the full price, in place of the plan saving that month), then the plan saving carries on. On a one-off it takes the place of the basket saving rather than adding to it: whichever is deeper.',
  },
  {
    id: 'store-code',
    name: 'Store discount codes (Settings → Discount codes)',
    channels: only('shop-once', 'shop-monthly', 'stack-once', 'stack-monthly'),
    switch: null,
    note: 'The founders’ own codes work on everything, single shop products included.',
  },
  {
    id: 'founder-code',
    name: 'Founder codes (free, cost price, under the minimum)',
    channels: only('shop-once', 'stack-once'),
    switch: null,
    note: 'One-off orders only, by design: on a plan they would make every renewal free.',
  },
  {
    id: 'basket-tier',
    name: 'Basket saving (8% over £50)',
    channels: only('shop-once', 'shop-monthly', 'stack-once'),
    switch: null,
    note: 'Any basket bought once, a quiz stack included. A monthly shop basket is priced exactly as the same basket bought once, so it keeps this saving too.',
  },
  {
    id: 'plan-saving',
    name: 'Plan saving (13%, 15% or 20% by bundle size)',
    channels: only('stack-monthly'),
    switch: null,
    note: 'Stacks and bundles only. A monthly shop basket has no plan saving: same price as buying it once.',
  },
  {
    id: 'first-month',
    name: 'First-month discount (scratch card)',
    channels: only('stack-monthly'),
    switch: 'Pricing (top bar) → intro offer',
    note: 'The first payment of a stack or bundle plan. Never on a monthly shop basket.',
  },
  {
    id: 'free-gift',
    name: 'Free gift',
    channels: only('stack-once', 'stack-monthly'),
    switch: 'Settings → Offer → free bonus',
    note: 'Stacks from the quiz or consult only, first order only, over the minimum spend. A partner code and the gift don’t combine: the one worth more applies.',
  },
  {
    id: 'member-prices',
    name: 'Member prices',
    channels: only('hub-top-up'),
    switch: 'Settings → Offer → Box services (sizes in Settings → Member hub)',
    note: 'In the hub, on products a member has bought, while their hub is open.',
  },
  {
    id: 'guarantee',
    name: 'First-box guarantee',
    channels: only('stack-monthly'),
    switch: 'Settings → Offer → box services',
    note: 'Off until its terms are agreed. Off, nothing mentions it.',
  },
]

export function offerRule(id: OfferId): OfferRule {
  const rule = OFFER_RULES.find((r) => r.id === id)
  if (!rule) throw new Error(`No offer rule ${id}`)
  return rule
}

/** Whether an offer can apply on a channel at all (before its switch and its own conditions). */
export function offerWorksOn(id: OfferId, channel: BuyChannel): boolean {
  return offerRule(id).channels[channel]
}
