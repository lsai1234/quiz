import type { StackBlueprint, StackSlotEntry } from '@/lib/stack-blueprint'
import type { Goal } from '@/lib/types'
import type { StackSlot, SwapGroup } from '@/lib/catalogue/types'

/**
 * Authoring helpers for seed bundles. Bundles are plain data (the portal edits
 * and duplicates them as data), but a couple of tiny builders keep the shipped
 * seeds terse and consistent so a fat-fingered slot field can't slip through.
 */

export interface CoreSlotSpec {
  slotType: StackSlot
  title: string
  description: string
  productId: string
  swapGroup: SwapGroup
  reason: string
}

/** A fixed, curated core slot — required, non-swappable, non-removable. */
export function coreSlot(spec: CoreSlotSpec, order: number): StackSlotEntry {
  return {
    slotId: `slot-${spec.slotType}-${order}`,
    slotType: spec.slotType,
    title: spec.title,
    description: spec.description,
    recommendedProductId: spec.productId,
    selectedProductId: spec.productId,
    selectedVariantId: null,
    required: true,
    canRemove: false,
    canSwap: false,
    swapGroup: spec.swapGroup,
    reason: spec.reason,
    confidenceScore: 92,
    displayOrder: order,
  }
}

export interface BlueprintSpec {
  slug: string
  name: string
  summary: string
  primaryGoal: Goal
  secondaryGoals: Goal[]
  profile: string
  cores: CoreSlotSpec[]
  /** Rough one-off / monthly figures — the UI prices live, these are placeholders. */
  estOneOff: number
  estSub: number
}

export function bundleBlueprint(spec: BlueprintSpec): StackBlueprint {
  return {
    id: `bundle-${spec.slug}`,
    stackName: spec.name,
    summary: spec.summary,
    primaryGoal: spec.primaryGoal,
    secondaryGoals: spec.secondaryGoals,
    userProfileSummary: spec.profile,
    slots: spec.cores.map((c, i) => coreSlot(c, i)),
    estimatedOneOffPrice: spec.estOneOff,
    estimatedSubscriptionPrice: spec.estSub,
    savingsSummary: 'Bundle discount applied at checkout',
    createdAt: '2026-07-19T09:00:00.000Z',
  }
}
