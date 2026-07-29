/**
 * The member's change policy: reading it, writing it, and turning it into the
 * one thing the system will actually do.
 *
 * Everything here is pure. `resolveIntendedAction` is the function the whole
 * design rests on — it takes what we know about a change and returns a concrete
 * resolution, ALWAYS. There is no input for which it can answer "wait and ask
 * someone", because there is no such state in this domain: a subscription that
 * needs a human before it can bill or ship is a subscription that has stopped
 * working. A property test in `__tests__/policy.test.ts` pins that down across
 * every combination of inputs.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { ChangePolicy, MemberSubscription, MemberSubscriptionLine } from '@/lib/recharge/types'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { meetsSafetyConstraints, NO_CONSTRAINTS } from './safety'
import type { SafetyConstraints } from '@/lib/recharge/types'
import {
  isAvailabilityKind,
  type ChangeKind,
  type IntendedAction,
  type IntendedActionReason,
} from './types'

/** Used when neither the line, the plan, nor the config says otherwise. */
export const FALLBACK_CHANGE_POLICY: ChangePolicy = 'auto-swap'

// ─── Reading the policy ───────────────────────────────────────────────────────

/**
 * The effective policy for a line, in precedence order:
 *
 *   1. `line.changePolicy` — an explicit per-line choice.
 *   2. `line.allowSubstitution === false` — the legacy opt-out. It used to mean
 *      "hold it and contact me"; that branch no longer exists, so it now maps to
 *      `remove`. Strictly better for the member than a stalled box, and the
 *      closest honest reading of "don't substitute this one".
 *      Note `=== false` specifically: `true` was the default for every line ever
 *      built, so it carries no intent and mustn't outrank the plan default.
 *   3. `sub.defaultChangePolicy` — what they chose at checkout.
 *   4. The configured default.
 */
export function policyForLine(
  sub: Pick<MemberSubscription, 'defaultChangePolicy'>,
  line: Pick<MemberSubscriptionLine, 'changePolicy' | 'allowSubstitution'>,
  config: PricingConfig = getPricingConfig(),
): ChangePolicy {
  if (line.changePolicy) return line.changePolicy
  if (line.allowSubstitution === false) return 'remove'
  return sub.defaultChangePolicy ?? configuredDefault(config)
}

/** The configured plan default, guarded against a bad portal override. */
export function configuredDefault(config: PricingConfig = getPricingConfig()): ChangePolicy {
  return config.defaultChangePolicy === 'remove' ? 'remove' : FALLBACK_CHANGE_POLICY
}

// ─── Writing the policy (pure) ────────────────────────────────────────────────

/** Keep the deprecated boolean in step so older readers stay correct. */
function withLegacyFlag(policy: ChangePolicy) {
  return { changePolicy: policy, allowSubstitution: policy === 'auto-swap' }
}

/** Set one line's policy. */
export function setLineChangePolicy(
  sub: MemberSubscription,
  lineId: string,
  policy: ChangePolicy,
): MemberSubscription {
  const lines = sub.lines.map((l) => (l.id === lineId ? { ...l, ...withLegacyFlag(policy) } : l))
  return { ...sub, lines }
}

/**
 * Set the plan-level default. Lines that never had an explicit choice of their
 * own follow it; ones the member deliberately set are left alone, so changing
 * the default doesn't quietly undo per-product decisions.
 */
export function setDefaultChangePolicy(sub: MemberSubscription, policy: ChangePolicy): MemberSubscription {
  const lines = sub.lines.map((l) => (l.changePolicy ? l : { ...l, ...withLegacyFlag(policy) }))
  return { ...sub, defaultChangePolicy: policy, lines }
}

/** Apply a `{ productId: policy }` map — the shape the checkout step submits. */
export function applyPolicyMap(
  sub: MemberSubscription,
  byProductId: Record<string, ChangePolicy>,
): MemberSubscription {
  const lines = sub.lines.map((l) =>
    byProductId[l.productId] ? { ...l, ...withLegacyFlag(byProductId[l.productId]) } : l,
  )
  return { ...sub, lines }
}

// ─── Choosing a replacement ───────────────────────────────────────────────────

export interface ReplacementOptions {
  /** Candidates already narrowed to in-stock products (the caller owns stock). */
  candidates: CatalogueProduct[]
  /** The line being replaced. */
  line: Pick<MemberSubscriptionLine, 'productId' | 'swapGroup' | 'quantity' | 'pricePerDelivery'>
  constraints: SafetyConstraints
  config?: PricingConfig
}

/**
 * The closest safe equivalent for a line: same swap group, clears the member's
 * hard exclusions, and priced within `substitutionPriceTolerancePct` of what
 * they're used to. Among those, the nearest unit price wins.
 *
 * The tolerance cuts both ways deliberately. Too dear and we'd be absorbing an
 * unbounded cost (a swap never raises the member's bill — see `apply.ts`); too
 * cheap and we'd be quietly downgrading someone who's paying for the better
 * product. "Closest equivalent" has to mean equivalent.
 */
export function findReplacement(opts: ReplacementOptions): CatalogueProduct | null {
  const config = opts.config ?? getPricingConfig()
  const tolerance = Math.max(0, config.substitutionPriceTolerancePct)
  const currentUnit = opts.line.pricePerDelivery / Math.max(1, opts.line.quantity)

  const eligible = opts.candidates.filter((p) => {
    if (p.id === opts.line.productId) return false
    if (p.swapGroup !== opts.line.swapGroup) return false
    if (p.isSubscriptionOnly || !p.subscriptionEligible) return false
    if (!meetsSafetyConstraints(p, opts.constraints)) return false
    if (currentUnit > 0) {
      const unit = unitPriceOf(p)
      if (Math.abs(unit - currentUnit) / currentUnit > tolerance) return false
    }
    return true
  })

  if (eligible.length === 0) return null
  return eligible.sort((a, b) => Math.abs(unitPriceOf(a) - currentUnit) - Math.abs(unitPriceOf(b) - currentUnit))[0]
}

/** A product's effective unit price (first available variant, else base). */
export function unitPriceOf(product: CatalogueProduct): number {
  const variant = product.variants.find((v) => v.available) ?? product.variants[0]
  return variant?.price ?? product.basePrice
}

/**
 * Whether a same-category product exists at all, ignoring the member's own
 * exclusions. Distinguishes "there's nothing left in this category" from
 * "there is, but it isn't safe for you" — which are different emails.
 */
export function anyCategoryCandidate(opts: Omit<ReplacementOptions, 'constraints'>): boolean {
  return findReplacement({ ...opts, constraints: NO_CONSTRAINTS }) !== null
}

// ─── The intended action ──────────────────────────────────────────────────────

export interface IntendedActionInput {
  kind: ChangeKind
  policy: ChangePolicy
  /** The safe replacement found for this line, if any. */
  replacement: CatalogueProduct | null
  /**
   * True when a same-category product exists but was rejected by the member's
   * dietary/stimulant exclusions — only used to explain WHY there's no swap.
   */
  unsafeCandidateExists?: boolean
  /**
   * True when removing this line would leave the plan empty or take the flat
   * monthly below `minSubscriptionMonthly`. Such a plan stops being a viable
   * subscription, so a founder gets a look before it lands.
   */
  wouldBreakPlan?: boolean
  config?: PricingConfig
}

/**
 * The heart of it: what will happen to this line.
 *
 * Availability changes resolve to `substitute` or `remove` and nothing else.
 * `remove` is the universal fallback — chosen by the member, or forced because
 * no safe replacement exists. It is always available, which is what guarantees
 * this function can never fail to decide.
 *
 * Price changes resolve to `absorb`: until a founder says otherwise, the member
 * pays exactly what they agreed to. That makes the "nobody looked at the queue"
 * outcome the one that can't hurt anyone.
 */
export function resolveIntendedAction(input: IntendedActionInput): IntendedAction {
  const config = input.config ?? getPricingConfig()

  if (!isAvailabilityKind(input.kind)) {
    return {
      resolution: { type: 'absorb' },
      reason: 'price-absorbed-by-default',
      // A price move always gets a founder's eye: absorbing it is safe for the
      // member but not necessarily for the margin.
      needsReview: true,
    }
  }

  const canSwap = input.policy === 'auto-swap' && input.replacement !== null
  const reason: IntendedActionReason = canSwap
    ? 'member-chose-swap'
    : input.policy === 'remove'
      ? 'member-chose-remove'
      : input.unsafeCandidateExists
        ? 'no-safe-replacement'
        : 'no-replacement-available'

  const resolution = canSwap
    ? ({ type: 'substitute', replacementProductId: input.replacement!.id } as const)
    : ({ type: 'remove' } as const)

  return {
    resolution,
    reason,
    needsReview: needsFounderReview(input, canSwap, config),
    // Only meaningful when we're actually removing something.
    breaksPlan: !canSwap && input.wouldBreakPlan ? true : undefined,
  }
}

/**
 * Which changes a founder should see before they land.
 *
 * A routine out-of-stock on a healthy plan doesn't need anyone: the member said
 * what they wanted and we can honour it. What earns a look is a change that's
 * permanent (`discontinued` — the replacement choice is worth a human's
 * judgement) or one that reshapes the plan rather than one line of it.
 */
function needsFounderReview(input: IntendedActionInput, canSwap: boolean, config: PricingConfig): boolean {
  if (config.founderReviewHours <= 0) return false
  // A plan-shape change only matters when we're the ones removing the line.
  if (input.wouldBreakPlan && !canSwap) return true
  if (input.kind === 'discontinued') return true
  // Losing a line because nothing safe exists is a bigger deal than a clean swap.
  return !canSwap && input.policy === 'auto-swap'
}

/** When an intended action applies without founder input. */
export function autoApplyAt(
  action: IntendedAction,
  from: Date = new Date(),
  config: PricingConfig = getPricingConfig(),
): string {
  if (!action.needsReview) return from.toISOString()
  const at = new Date(from)
  at.setHours(at.getHours() + Math.max(0, config.founderReviewHours))
  return at.toISOString()
}

/** True when the review window has elapsed and the intended action should land. */
export function isDueForAutoApply(autoApplyAtIso: string, now: Date = new Date()): boolean {
  const at = new Date(autoApplyAtIso)
  return !Number.isNaN(at.getTime()) && at <= now
}
