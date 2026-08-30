/**
 * Assembling a change event.
 *
 * Detection (P4) finds the facts; this turns them into a stored event, deciding
 * the intended action and the moment it lands. Kept separate from detection so
 * it's testable without a supplier feed, and separate from `policy.ts` so that
 * file stays pure decision logic.
 */
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { MemberSubscription, MemberSubscriptionLine, SafetyConstraints } from '@/lib/recharge/types'
import { getPricingConfig, type PricingConfig } from '@/lib/stack-blueprint/pricing'
import { effectiveNextDispatch } from '@/lib/recharge/mock'
import { autoApplyAt, policyForLine, resolveIntendedAction } from './policy'
import { applyResolution, removalWouldBreakPlan, type ApplyResult } from './apply'
import { constraintsFor } from './safety'
import type {
  BillingPreview,
  ChangeEvent,
  ChangeKind,
  IntendedAction,
  PriceMove,
} from './types'

/**
 * Stable id for "this line, this kind of problem".
 *
 * Deterministic on purpose: re-running detection while a change is still open
 * updates the same row instead of piling up duplicates, and a resolved event
 * can't be silently re-raised by the next sweep. It's also what makes skipping
 * the v3 → v4 back-fill safe — the same event simply re-derives.
 */
export function changeEventId(userId: string, lineId: string, kind: ChangeKind): string {
  return `chg_${userId}_${lineId}_${kind}`
}

export interface CreateChangeEventInput {
  kind: ChangeKind
  userId: string
  subscription: MemberSubscription
  line: MemberSubscriptionLine
  /** The safe replacement found for this line, if any. */
  replacement?: CatalogueProduct | null
  /** A same-category product exists but fails the member's exclusions. */
  unsafeCandidateExists?: boolean
  /** Supplier SKU that triggered it. */
  sku?: string | null
  /** Price facts, for price kinds. */
  price?: PriceMove
  now?: Date
  config?: PricingConfig
  /** Carried over from an existing open event so the queue keeps its ordering. */
  createdAt?: string
  /**
   * The constraints the replacement was actually judged against.
   *
   * Passed in rather than re-derived so the record cannot disagree with the
   * decision: the caller may have topped the snapshot up from saved quiz answers
   * (see `constraintsFor`), and recomputing here from the subscription alone
   * would store a weaker set than the one that ran.
   */
  constraints?: SafetyConstraints
}

/**
 * The money preview, derived by actually running the intended action rather
 * than by a parallel calculation.
 *
 * `computeSwapImpact` would be the obvious source, but it prices a swap without
 * `apply.ts`'s cap rule — so a substitution to a dearer product would preview an
 * increase that never happens. Running the real apply path means the founder's
 * preview and the member's outcome cannot drift apart.
 */
function previewFrom(
  sub: MemberSubscription,
  result: ApplyResult,
  now: Date,
): BillingPreview {
  const next = result.subscription
  return {
    currentMonthly: sub.flatMonthly,
    newMonthly: next.flatMonthly,
    monthlyDelta: Math.round((next.flatMonthly - sub.flatMonthly) * 100) / 100,
    oneOffNow: 0,
    // Involuntary changes never charge the pay-for-what-shipped settlement.
    settlement: 0,
    credit: result.billingChange?.oneOffCredit ?? 0,
    effectiveFrom: result.billingChange?.effectiveFrom ?? effectiveNextDispatch(sub, now).toISOString(),
  }
}

export function createChangeEvent(input: CreateChangeEventInput): ChangeEvent {
  const config = input.config ?? getPricingConfig()
  const now = input.now ?? new Date()
  const { subscription: sub, line } = input

  const policy = policyForLine(sub, line, config)
  const wouldBreakPlan = removalWouldBreakPlan(sub, line.id, config)
  const baseInput = {
    kind: input.kind,
    policy,
    unsafeCandidateExists: input.unsafeCandidateExists,
    wouldBreakPlan,
    config,
  }

  let action = resolveIntendedAction({ ...baseInput, replacement: input.replacement ?? null })
  let replacement = input.replacement ?? null
  const catalogue = replacement ? [replacement] : []

  // Dry-run the intended action. A substitution can still be refused at this
  // point — capping it to the member's current price (so their bill doesn't
  // rise) can land under the margin floor. That's not a swap we can make, so
  // fall through to the fallback that's always available.
  let result = applyResolution(sub, line.id, action.resolution, { catalogue, event: { id: '', kind: input.kind }, now, config })
  if (result.rejected === 'below-margin-floor' || result.rejected === 'replacement-not-found') {
    replacement = null
    action = { ...resolveIntendedAction({ ...baseInput, replacement: null }), reason: 'replacement-uneconomic' }
    result = applyResolution(sub, line.id, action.resolution, { catalogue: [], event: { id: '', kind: input.kind }, now, config })
  }

  const iso = now.toISOString()
  return {
    id: changeEventId(input.userId, line.id, input.kind),
    kind: input.kind,
    status: action.needsReview ? 'requires-action' : 'auto-resolved',

    userId: input.userId,
    customerEmail: sub.customerEmail ?? null,
    subscriptionId: sub.id,

    lineId: line.id,
    productId: line.productId,
    productTitle: line.productTitle,
    sku: input.sku ?? null,
    slotTitle: line.slotTitle,
    swapGroup: line.swapGroup,

    policy,
    constraints: input.constraints ?? constraintsFor(sub),
    intendedAction: action,
    autoApplyAt: autoApplyAt(action, now, config),

    suggestedReplacementId: replacement?.id ?? null,
    suggestedReplacementTitle: replacement?.title ?? null,
    billingPreview: result.rejected ? null : previewFrom(sub, result, now),
    price: input.price,

    createdAt: input.createdAt ?? iso,
    updatedAt: iso,
    resolvedAt: null,
  }
}
