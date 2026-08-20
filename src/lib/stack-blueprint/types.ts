import type { Goal, StackLevel } from '@/lib/types'
import type { StackSlot, SwapGroup } from '@/lib/catalogue/types'

// NOTE: 'StackSlotEntry' is used instead of 'StackSlot' to avoid naming conflict with catalogue's StackSlot type
export interface StackSlotEntry {
  slotId: string                    // e.g. "slot-protein"
  slotType: StackSlot               // 'protein' | 'performance' | etc.
  title: string                     // e.g. "Protein"
  description: string               // e.g. "Builds and repairs muscle"
  recommendedProductId: string      // product id the engine picked
  selectedProductId: string         // what the user currently has selected (starts = recommended)
  selectedVariantId: string | null  // selected flavour/size variant id, null = default
  required: boolean                 // if true, cannot be removed
  canRemove: boolean                // inverse of required, for convenience
  canSwap: boolean                  // whether the user can swap to another product
  swapGroup: SwapGroup              // used to find alternatives
  reason: string                    // plain-English reason this slot is included
  confidenceScore: number           // 0-100, how confident the engine is
  displayOrder: number              // sort order in UI
  /**
   * True when the member added this themselves from the upgrades card, rather
   * than the engine choosing it. Depth tiers keep it whatever their price band
   * says — a product someone asked for is never sized back out of their stack.
   */
  addedByUser?: boolean
}

export interface StackBlueprint {
  id: string
  stackName: string
  summary: string
  primaryGoal: Goal
  secondaryGoals: Goal[]
  userProfileSummary: string        // e.g. "Active 25-34 male, strength training 4x/week"
  slots: StackSlotEntry[]
  estimatedOneOffPrice: number
  estimatedSubscriptionPrice: number
  savingsSummary: string            // e.g. "Save £12.50/month with subscription"
  createdAt: string                 // ISO date string
  /** True when an AI pass personalised the product choices / reasons. */
  personalised?: boolean
  /**
   * Goals the user chose that no product in the final stack covers — because the
   * only candidates were removed by a hard gate (safety, dietary). Drives the
   * honest "no strong match — speak to your GP" note on the reveal, instead of a
   * silent gap. Empty/absent = every chosen goal is covered.
   */
  unmetGoals?: Goal[]
  /**
   * The bundle tier this stack represents. Drives the fixed subscribe-&-save
   * rate. When unset, derived from the product count via `stackLevelOf`.
   */
  level?: StackLevel
}
