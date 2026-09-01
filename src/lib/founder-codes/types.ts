/**
 * Founder codes — the shapes.
 *
 * NOT a partner code, and deliberately a separate domain rather than a fourth
 * `PartnerCode` kind. A partner code is a commercial instrument: it belongs to a
 * counterparty, earns them commission, is priced against what a stack is worth
 * over its life, and is never allowed to sell below the margin floor. A founder
 * code is the opposite of all four — it belongs to us, earns nobody anything,
 * is not priced at all, and its entire purpose is to go *under* the floor.
 *
 * Folding them together would mean the margin floor, the first-order rule and
 * the commission accrual each needed an "unless it's a founder" branch, and the
 * one that got missed would be the expensive one.
 */

export type FounderCodeKind =
  /**
   * Everything free: every line at £0.00 and no delivery charge.
   *
   * The whole order costs nothing, so there is nothing for Stripe to take —
   * `/api/cart` raises it as paid without a payment. That is the only path in
   * the app that books a paid order nobody paid for, and this code is what
   * authorises it.
   */
  | 'free'
  /**
   * Cost price: what the order actually costs US, and nothing on top.
   *
   * Both halves move, in opposite directions, which is the point:
   *   • goods drop from the shelf price to what PowerBody charge us, and
   *   • delivery RISES from our customer rate (often free) to what PowerBody
   *     actually charge us to ship the parcel.
   *
   * Charging our own delivery rate on a cost-price order would be the same
   * mistake the margin model exists to prevent, one screen further down: the
   * goods would be at cost and the postage would be a loss.
   */
  | 'cost'
  /**
   * Neither. Full retail, full delivery — it only waives `minOrderValue`.
   *
   * For buying one thing off the shelf at the price a customer would pay,
   * without needing £15 of basket to be allowed to.
   */
  | 'unlock'

/**
 * One issued code.
 *
 * Single use and short-lived by construction — see `FOUNDER_CODE_TTL_HOURS` and
 * `claimToken`. There is no "uses" dial: a reusable code that takes 100% off is
 * a different and much more dangerous object than the one being asked for here,
 * and adding the dial later is an additive change, whereas taking it away is not.
 */
export interface FounderCode {
  /** The code itself, normalised — e.g. `FH-FREE-7K4M2XQP`. */
  code: string
  kind: FounderCodeKind
  /** Why it was made. Founder-facing only; never shown at checkout. */
  note: string | null
  /** Email of the founder who generated it. Attribution, not authorisation. */
  createdBy: string | null
  createdAt: string
  /** ISO. Past this it is dead however it is presented. */
  expiresAt: string
  /**
   * Set the instant a checkout claims the code, BEFORE the order exists.
   *
   * This is the single-use lock, and it is a claim rather than a counter
   * because a counter cannot be incremented safely through an engine whose
   * `run` reports no row count. Two concurrent checkouts both write
   * `WHERE claim_token IS NULL`; only one lands, and the read-back tells each
   * of them which one it was.
   */
  claimToken: string | null
  claimedAt: string | null
  /** Set once the claim turned into a real order. A claim without one was released. */
  usedAt: string | null
  orderId: string | null
  /** Set when a founder kills the code by hand. */
  revokedAt: string | null
}

/** What a code is worth, in words, wherever one has to be described. */
export const FOUNDER_CODE_LABELS: Record<FounderCodeKind, { title: string; blurb: string }> = {
  free: {
    title: 'Everything free',
    blurb: 'Every product at £0.00 and no delivery charge. Nothing is taken from a card.',
  },
  cost: {
    title: 'Cost price',
    blurb:
      'Products at what PowerBody charge us, and delivery at what they actually charge us to ship it — not our customer rate.',
  },
  unlock: {
    title: 'Below the minimum',
    blurb: 'Ordinary prices and ordinary delivery. It only waives the £ minimum order.',
  },
}

/** The state a code is in, for a screen that has to say so. */
export type FounderCodeState = 'live' | 'used' | 'expired' | 'revoked'
