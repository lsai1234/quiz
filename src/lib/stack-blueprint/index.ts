export type { StackBlueprint, StackSlotEntry } from './types'
export * from './helpers'
export { buildStackBlueprint, scoreProduct, scoreProductDetailed, getArchetype, checksForSlots } from './factory'
export type { Archetype, SlotType } from './factory'
export type {
  Contribution, ContributionField, Exclusion, ExclusionReason, ScoreDetail, StackCheck, StackCheckKind, BundleRuleId,
} from './explain-types'
export { MOCK_BLUEPRINT } from './mock-blueprint'
export { planTiers, tierPlanFor } from './tier-plan'
export type { TierPlan } from './tier-plan'
export { calculatePricing, qualifiesForSubscription, getSubscriptionProduct, buildSubscriptionPlan, workoutsPerMonth, resolveConsumption, resolveTier, resolveSubscriptionRate, unitCostOf, discountWithFloor, formatGBP, formatSaving, PRICING_CONFIG } from './pricing'
export type { StackPricing, SubscriptionLine, DiscountTier } from './pricing'
export { validateCheckout, validationErrorMessage } from './checkout'
export type { CheckoutLineItem, ValidationError, CheckoutValidation } from './checkout'
