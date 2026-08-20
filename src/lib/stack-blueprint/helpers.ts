import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { StackBlueprint, StackSlotEntry } from './types'

/**
 * Returns the resolved CatalogueProduct for each slot's selectedProductId.
 * Skips slots where selectedProductId doesn't match any catalogue product.
 */
export function getSelectedProductsForStack(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[]
): CatalogueProduct[] {
  const results: CatalogueProduct[] = []
  for (const slot of blueprint.slots) {
    const product = catalogue.find(p => p.id === slot.selectedProductId)
    if (product) results.push(product)
  }
  return results
}

/**
 * Sum of each slot's selected variant price (or product basePrice if no variant selected).
 */
export function calculateStackPrice(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[]
): number {
  let total = 0
  for (const slot of blueprint.slots) {
    const product = catalogue.find(p => p.id === slot.selectedProductId)
    if (!product) continue
    if (slot.selectedVariantId) {
      const variant = product.variants.find(v => v.id === slot.selectedVariantId)
      total += variant ? variant.price : product.basePrice
    } else {
      total += product.basePrice
    }
  }
  return Math.round(total * 100) / 100
}

/**
 * Same as calculateStackPrice but uses variant's subscription price if available.
 * Subscription price = basePrice * 0.85 (15% discount) when subscriptionEligible.
 * Non-subscription-eligible products are included at full price.
 */
export function calculateSubscriptionPrice(
  blueprint: StackBlueprint,
  catalogue: CatalogueProduct[]
): number {
  let total = 0
  for (const slot of blueprint.slots) {
    const product = catalogue.find(p => p.id === slot.selectedProductId)
    if (!product) continue
    let price: number
    if (slot.selectedVariantId) {
      const variant = product.variants.find(v => v.id === slot.selectedVariantId)
      price = variant ? variant.price : product.basePrice
    } else {
      price = product.basePrice
    }
    if (product.subscriptionEligible) {
      price = price * 0.85
    }
    total += price
  }
  return Math.round(total * 100) / 100
}

/**
 * Returns all catalogue products that share the same swapGroup as the given slot,
 * excluding the currently selected product.
 */
export function getSwappableProductsForSlot(
  slot: StackSlotEntry,
  catalogue: CatalogueProduct[]
): CatalogueProduct[] {
  return catalogue.filter(
    p => p.swapGroup === slot.swapGroup && p.id !== slot.selectedProductId && !p.isSubscriptionOnly
  )
}

/**
 * Returns a new blueprint with the specified slot's selectedProductId updated.
 * Also resets selectedVariantId to null (user picks variant separately).
 * Throws if slotId not found.
 */
export function updateStackSlotProduct(
  blueprint: StackBlueprint,
  slotId: string,
  newProductId: string
): StackBlueprint {
  const slotIndex = blueprint.slots.findIndex(s => s.slotId === slotId)
  if (slotIndex === -1) {
    throw new Error(`Slot not found: ${slotId}`)
  }
  const newSlots = blueprint.slots.map((slot, i) =>
    i === slotIndex
      ? { ...slot, selectedProductId: newProductId, selectedVariantId: null }
      : slot
  )
  return { ...blueprint, slots: newSlots }
}

/**
 * Returns a new blueprint with the specified slot's selectedVariantId updated.
 * Throws if slotId not found.
 */
export function updateStackSlotVariant(
  blueprint: StackBlueprint,
  slotId: string,
  variantId: string | null
): StackBlueprint {
  const slotIndex = blueprint.slots.findIndex(s => s.slotId === slotId)
  if (slotIndex === -1) {
    throw new Error(`Slot not found: ${slotId}`)
  }
  const newSlots = blueprint.slots.map((slot, i) =>
    i === slotIndex ? { ...slot, selectedVariantId: variantId } : slot
  )
  return { ...blueprint, slots: newSlots }
}

/**
 * Returns a new blueprint with the specified slot removed.
 * Throws if slot is required (required === true).
 */
export function removeOptionalSlot(
  blueprint: StackBlueprint,
  slotId: string
): StackBlueprint {
  const slot = blueprint.slots.find(s => s.slotId === slotId)
  if (!slot) {
    throw new Error(`Slot not found: ${slotId}`)
  }
  if (slot.required) {
    throw new Error(`Cannot remove required slot: ${slotId}`)
  }
  return { ...blueprint, slots: blueprint.slots.filter(s => s.slotId !== slotId) }
}

/**
 * Adds a booster slot to the blueprint.
 * The new slot is appended with required=false, canRemove=true, canSwap=true.
 * displayOrder = max existing displayOrder + 1.
 */
export function addBoosterSlot(
  blueprint: StackBlueprint,
  slot: Omit<StackSlotEntry, 'displayOrder' | 'canRemove'>
): StackBlueprint {
  const maxOrder = blueprint.slots.reduce((max, s) => Math.max(max, s.displayOrder), 0)
  const newSlot: StackSlotEntry = {
    ...slot,
    required: false,
    canRemove: true,
    canSwap: true,
    addedByUser: true,
    displayOrder: maxOrder + 1,
  }
  return { ...blueprint, slots: [...blueprint.slots, newSlot] }
}
