/**
 * The product-change domain.
 *
 * One event shape covers every reason a line on a live subscription has to
 * change: the product went out of stock, it was discontinued, or the supplier
 * moved its price. Supersedes the narrower `stock_exceptions` model in
 * `lib/stock` (which only knew about out-of-stock) and is stored in the
 * `subscription_changes` table (migration v4).
 *
 * The rule that shapes everything here: **an event always resolves on its own.**
 * Each one is created carrying the action the system intends to take, derived
 * from the member's own `ChangePolicy`, plus the moment that action applies
 * without anyone intervening. A founder can override inside that window; if
 * nobody does, it still lands. Nothing ever waits on a member's reply, and a
 * founder's inbox is never the reason a delivery slips.
 *
 * See docs/PRODUCT_CHANGES_SPEC.md.
 */
import type { SwapGroup } from '@/lib/catalogue/types'
import type { ChangePolicy } from '@/lib/recharge/types'
import type { PlanChangeImpact } from '@/lib/recharge/mock'

export type { ChangePolicy }

/** Why a line has to change. */
export type ChangeKind =
  /** Temporarily unavailable at the supplier — may come back. */
  | 'out-of-stock'
  /** Gone for good: delisted, or absent from the feed for N consecutive syncs. */
  | 'discontinued'
  /** Supplier cost/RRP up beyond `priceChangeThresholdPct`. */
  | 'price-increase'
  /** Supplier cost/RRP down beyond `priceChangeThresholdPct`. */
  | 'price-decrease'

/** Kinds where the product itself is going away (as opposed to just re-pricing). */
export const AVAILABILITY_KINDS: ChangeKind[] = ['out-of-stock', 'discontinued']
export const PRICE_KINDS: ChangeKind[] = ['price-increase', 'price-decrease']

export function isAvailabilityKind(kind: ChangeKind): boolean {
  return AVAILABILITY_KINDS.includes(kind)
}

export type ChangeStatus =
  /** In the founder's queue with an intended action and a deadline. Reviewable, never blocking. */
  | 'requires-action'
  /** The member's policy settled it; no founder input was needed. */
  | 'auto-resolved'
  /** Resolved, but takes effect at a future billing date (e.g. after price-rise notice). */
  | 'scheduled'
  /** Subscription and billing updated. */
  | 'applied'
  /** Supplier recovered, or a founder dismissed it. */
  | 'cancelled'

/** Statuses that still need something to happen to them. */
export const OPEN_STATUSES: ChangeStatus[] = ['requires-action', 'auto-resolved', 'scheduled']

export type ChangeResolution =
  /** Swap the line to an in-stock, safety-compatible product in the same category. */
  | { type: 'substitute'; replacementProductId: string }
  /** Take the line off the plan and lower the monthly from the next cycle. */
  | { type: 'remove' }
  /** Founder-only: skip this line's next box and keep it (for a temporary outage). */
  | { type: 'hold' }
  /** Price move: we absorb it. Member's price is untouched. */
  | { type: 'absorb' }
  /** Price move: passed to the member at `newUnitPrice`, after notice. */
  | { type: 'pass-on'; newUnitPrice: number }
  /** Not a real problem — close it with no change. */
  | { type: 'dismiss' }

export type ResolutionType = ChangeResolution['type']

/**
 * Why the system intends what it intends. Surfaced to the founder in the queue
 * and used to pick the member's email template, so it has to distinguish "they
 * asked for this" from "we had no safe alternative" — those read very
 * differently to someone whose plan just shrank.
 */
export type IntendedActionReason =
  /** Their policy is auto-swap and we found a safe replacement. */
  | 'member-chose-swap'
  /** Their policy is remove. */
  | 'member-chose-remove'
  /** Their policy is auto-swap, but nothing in the category is available. */
  | 'no-replacement-available'
  /** A replacement exists but fails their dietary/stimulant exclusions. */
  | 'no-safe-replacement'
  /**
   * A safe replacement exists, but holding it at the member's current price (so
   * a swap they didn't ask for can't raise their bill) would sell below the
   * margin floor. Not a swap we can make.
   */
  | 'replacement-uneconomic'
  /** Price moves default to absorbed until a founder says otherwise. */
  | 'price-absorbed-by-default'

/** What the system will do to this line, and whether a founder should look first. */
export interface IntendedAction {
  resolution: ChangeResolution
  /**
   * WHY this is happening, from the member's point of view — it picks their
   * email template, so it always names the cause ("you asked us to", "we
   * couldn't find a safe match"), never the internal escalation.
   */
  reason: IntendedActionReason
  /**
   * Whether this sits in the founder queue before applying. `false` → applied on
   * the next run. Either way `autoApplyAt` governs when it actually lands.
   */
  needsReview: boolean
  /**
   * The removal would empty the plan or take it below the minimum monthly — a
   * founder-facing escalation flag, deliberately separate from `reason` because
   * it's orthogonal to the cause and speaks to a different audience.
   */
  breaksPlan?: boolean
}

/** The money impact, computed at detection so the founder sees it before acting. */
export type BillingPreview = PlanChangeImpact

/** Supplier price facts, on price-change events only. */
export interface PriceMove {
  previousWholesale: number
  newWholesale: number
  previousRrp: number
  newRrp: number
  /** Signed change in wholesale cost, 0–1 (0.08 = 8% dearer). */
  wholesaleDeltaPct: number
}

/**
 * One line on one member's subscription needing one change.
 *
 * Price moves affect a whole SKU rather than one person, but an event is still
 * raised per affected line: the money, the notice date and the email are all
 * per-member, and the hub groups them back together for the founder.
 */
export interface ChangeEvent {
  id: string
  kind: ChangeKind
  status: ChangeStatus

  // Who
  userId: string
  customerEmail: string | null
  subscriptionId: string

  // What
  lineId: string
  productId: string
  productTitle: string
  sku: string | null
  slotTitle: string
  swapGroup: SwapGroup

  /** The member's policy for this line when the event was raised. */
  policy: ChangePolicy
  /** What happens if nobody intervenes. */
  intendedAction: IntendedAction
  /** ISO — when `intendedAction` applies without founder input. */
  autoApplyAt: string

  /** The best safe replacement found at detection, if any. */
  suggestedReplacementId: string | null
  suggestedReplacementTitle: string | null
  /** Money preview for the intended action. */
  billingPreview: BillingPreview | null
  /** Supplier price facts (price kinds only). */
  price?: PriceMove

  // Outcome
  resolution?: ChangeResolution
  resolutionSource?: 'system' | 'founder'
  resolutionDetail?: string
  /** The `BillingChange` this produced, for cross-referencing the audit trail. */
  billingChangeId?: string
  /** Set when applying failed (e.g. Stripe rejected the new amount). Keeps the
   *  event visible rather than silently half-applied. */
  error?: string | null
  /**
   * When the member was told (ISO). An applied change with no `notifiedAt` is
   * something we did to someone's plan without saying so — the outbox sweep
   * (P5) treats that as work outstanding, and a failed send leaves it null
   * rather than silently marking the job done.
   */
  notifiedAt?: string | null

  createdAt: string
  updatedAt: string
  resolvedAt?: string | null
  appliedAt?: string | null
}

/** Filters for the founder queue. */
export interface ChangeQuery {
  status?: ChangeStatus | ChangeStatus[]
  kind?: ChangeKind | ChangeKind[]
  userId?: string
}
