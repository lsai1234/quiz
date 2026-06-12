/**
 * Integration tests — verify end-to-end correctness of the features.
 *
 * These tests exercise real feature interactions: quiz answers → blueprint,
 * blueprint → pricing, blueprint → checkout validation, blueprint mutations
 * (swap, variant, booster add/remove) all propagating through to consistent
 * state and price totals.
 */

import { buildStackBlueprint } from '../factory'
import { calculatePricing, PRICING_CONFIG } from '../pricing'
import {
  updateStackSlotProduct,
  updateStackSlotVariant,
  addBoosterSlot,
  removeOptionalSlot,
  getSwappableProductsForSlot,
} from '../helpers'
import { validateCheckout } from '../checkout'
import { MOCK_CATALOGUE } from '@/lib/catalogue/mock-catalogue'
import type { QuizAnswers } from '@/lib/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_ANSWERS: QuizAnswers = {
  name: 'Test User',
  track: 'performance',
  ageBracket: '25-34',
  gender: 'male',
  goals: ['muscle', 'recovery'],
  trainingFrequency: '3-4x',
  trainingType: 'strength',
  lifestyle: [],
  diet: 'clean',
  currentSupplements: [],
  caffeineLevel: 'medium',
  budget: '50-80',
  stackPreference: 'balanced',
  trainingExperience: 'intermediate',
  trainingFocus: null,
  stimPreference: 'yes',
  exactAge: null,
  currentVitamins: [],
  preferredFormats: [],
  wellbeingAnswers: {},
}

// ─── Feature 3: Quiz → Blueprint ──────────────────────────────────────────────

describe('Feature 3: buildStackBlueprint', () => {
  it('generates a blueprint with at least one slot from MOCK_CATALOGUE', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    expect(bp.slots.length).toBeGreaterThan(0)
    expect(bp.stackName).toBeTruthy()
    expect(bp.summary).toBeTruthy()
    expect(bp.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('muscle archetype produces muscle-themed stack name', () => {
    const bp = buildStackBlueprint({ ...BASE_ANSWERS, goals: ['muscle'] }, MOCK_CATALOGUE)
    expect(['Performance Core Stack', 'Strength Engine Stack']).toContain(bp.stackName)
  })

  it('fat-loss archetype produces fat-loss-themed stack name', () => {
    const bp = buildStackBlueprint({ ...BASE_ANSWERS, goals: ['cutting'] }, MOCK_CATALOGUE)
    expect(['Lean Power Stack', 'Fat Loss Protocol']).toContain(bp.stackName)
  })

  it('health archetype is used when no specific goal is set', () => {
    const bp = buildStackBlueprint({ ...BASE_ANSWERS, goals: ['health'] }, MOCK_CATALOGUE)
    expect(['Daily Charge Stack', 'Foundation Health Stack']).toContain(bp.stackName)
  })

  it('stim-free preference excludes stimulant products from energy slot', () => {
    const bp = buildStackBlueprint(
      { ...BASE_ANSWERS, stimPreference: 'no', caffeineLevel: 'none' },
      MOCK_CATALOGUE,
    )
    const energySlot = bp.slots.find((s) => s.slotType === 'energy')
    if (energySlot) {
      const product = MOCK_CATALOGUE.find((p) => p.id === energySlot.selectedProductId)
      expect(product?.hasStimulants).toBe(false)
    }
  })

  it('vegan lifestyle excludes non-vegan products from all slots', () => {
    const bp = buildStackBlueprint(
      { ...BASE_ANSWERS, lifestyle: ['vegan'] },
      MOCK_CATALOGUE,
    )
    for (const slot of bp.slots) {
      const product = MOCK_CATALOGUE.find((p) => p.id === slot.selectedProductId)
      if (product) {
        expect(product.dietaryTags).toContain('vegan')
      }
    }
  })

  it('already-taking protein reduces protein slot confidence', () => {
    const bpWithout = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const bpWith = buildStackBlueprint(
      { ...BASE_ANSWERS, currentSupplements: ['protein'] },
      MOCK_CATALOGUE,
    )
    const proteinWithout = bpWithout.slots.find((s) => s.slotType === 'protein')
    const proteinWith = bpWith.slots.find((s) => s.slotType === 'protein')
    if (proteinWithout && proteinWith) {
      expect(proteinWith.confidenceScore).toBeLessThan(proteinWithout.confidenceScore)
    }
  })

  it('protein and performance slots are required', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const protein = bp.slots.find((s) => s.slotType === 'protein')
    const performance = bp.slots.find((s) => s.slotType === 'performance')
    expect(protein?.required).toBe(true)
    expect(protein?.canRemove).toBe(false)
    expect(performance?.required).toBe(true)
    expect(performance?.canRemove).toBe(false)
  })

  it('optional slots have canRemove=true', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    for (const slot of bp.slots) {
      if (!slot.required) {
        expect(slot.canRemove).toBe(true)
      }
    }
  })

  it('all selected products exist in the catalogue', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    for (const slot of bp.slots) {
      const product = MOCK_CATALOGUE.find((p) => p.id === slot.selectedProductId)
      expect(product).toBeDefined()
    }
  })

  it('sets a default variant for each slot where product has variants', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    for (const slot of bp.slots) {
      const product = MOCK_CATALOGUE.find((p) => p.id === slot.selectedProductId)
      if (product && product.variants.length > 0) {
        expect(slot.selectedVariantId).toBeTruthy()
      }
    }
  })

  it('estimatedOneOffPrice is > 0 when products are found', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    expect(bp.estimatedOneOffPrice).toBeGreaterThan(0)
  })

  it('estimatedSubscriptionPrice is less than or equal to oneOffPrice', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    expect(bp.estimatedSubscriptionPrice).toBeLessThanOrEqual(bp.estimatedOneOffPrice)
  })

  it('generates unique slot IDs', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const ids = bp.slots.map((s) => s.slotId)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('each slot has a non-empty reason', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    for (const slot of bp.slots) {
      expect(slot.reason.length).toBeGreaterThan(0)
    }
  })
})

// ─── Feature 5: Variant selection ─────────────────────────────────────────────

describe('Feature 5: variant selection', () => {
  it('updateStackSlotVariant changes selectedVariantId', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const slot = bp.slots[0]
    const product = MOCK_CATALOGUE.find((p) => p.id === slot.selectedProductId)!
    const otherVariant = product.variants.find((v) => v.id !== slot.selectedVariantId)
    if (!otherVariant) return // single-variant product, skip
    const updated = updateStackSlotVariant(bp, slot.slotId, otherVariant.id)
    expect(updated.slots[0].selectedVariantId).toBe(otherVariant.id)
    expect(bp.slots[0].selectedVariantId).not.toBe(otherVariant.id) // immutability
  })

  it('pricing reflects variant price change after variant update', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const slot = bp.slots[0]
    const product = MOCK_CATALOGUE.find((p) => p.id === slot.selectedProductId)!
    const cheapVariant = product.variants.reduce((min, v) => v.price < min.price ? v : min, product.variants[0])
    const expensiveVariant = product.variants.reduce((max, v) => v.price > max.price ? v : max, product.variants[0])
    if (cheapVariant.id === expensiveVariant.id) return

    const withCheap = updateStackSlotVariant(bp, slot.slotId, cheapVariant.id)
    const withExpensive = updateStackSlotVariant(bp, slot.slotId, expensiveVariant.id)
    const priceCheap = calculatePricing(withCheap, MOCK_CATALOGUE).oneOffTotal
    const priceExpensive = calculatePricing(withExpensive, MOCK_CATALOGUE).oneOffTotal
    expect(priceExpensive).toBeGreaterThanOrEqual(priceCheap)
  })

  it('updateStackSlotVariant does not mutate original blueprint', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const slot = bp.slots[0]
    const originalVariantId = slot.selectedVariantId
    updateStackSlotVariant(bp, slot.slotId, 'fake-variant-id')
    expect(bp.slots[0].selectedVariantId).toBe(originalVariantId)
  })
})

// ─── Feature 6: Product swap ──────────────────────────────────────────────────

describe('Feature 6: product swap', () => {
  it('updateStackSlotProduct changes selectedProductId', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const proteinSlot = bp.slots.find((s) => s.slotType === 'protein')!
    const alternatives = getSwappableProductsForSlot(proteinSlot, MOCK_CATALOGUE)
    if (alternatives.length === 0) return

    const newProduct = alternatives[0]
    const updated = updateStackSlotProduct(bp, proteinSlot.slotId, newProduct.id)
    const updatedSlot = updated.slots.find((s) => s.slotId === proteinSlot.slotId)!
    expect(updatedSlot.selectedProductId).toBe(newProduct.id)
  })

  it('updateStackSlotProduct resets selectedVariantId to null', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const slot = bp.slots[0]
    const updated = updateStackSlotProduct(bp, slot.slotId, 'different-product')
    expect(updated.slots[0].selectedVariantId).toBeNull()
  })

  it('getSwappableProductsForSlot excludes the currently selected product', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const slot = bp.slots[0]
    const alternatives = getSwappableProductsForSlot(slot, MOCK_CATALOGUE)
    const currentInAlternatives = alternatives.find((p) => p.id === slot.selectedProductId)
    expect(currentInAlternatives).toBeUndefined()
  })

  it('getSwappableProductsForSlot returns only products in same swapGroup', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const slot = bp.slots[0]
    const alternatives = getSwappableProductsForSlot(slot, MOCK_CATALOGUE)
    for (const alt of alternatives) {
      expect(alt.swapGroup).toBe(slot.swapGroup)
    }
  })

  it('does not mutate original blueprint on swap', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const slot = bp.slots[0]
    const originalId = slot.selectedProductId
    updateStackSlotProduct(bp, slot.slotId, 'other-product')
    expect(bp.slots[0].selectedProductId).toBe(originalId)
  })
})

// ─── Feature 7: Boosters ──────────────────────────────────────────────────────

describe('Feature 7: optional boosters', () => {
  it('addBoosterSlot appends a new slot with required=false and canRemove=true', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const boosterProduct = MOCK_CATALOGUE.find((p) => p.isBoosterEligible)!
    const updated = addBoosterSlot(bp, {
      slotId: `booster-${boosterProduct.id}`,
      slotType: boosterProduct.stackSlots[0],
      title: 'Recovery',
      description: 'Supports recovery',
      recommendedProductId: boosterProduct.id,
      selectedProductId: boosterProduct.id,
      selectedVariantId: null,
      required: false,
      canSwap: true,
      swapGroup: boosterProduct.swapGroup,
      reason: boosterProduct.shortReason,
      confidenceScore: 70,
    })
    const newSlot = updated.slots.find((s) => s.slotId === `booster-${boosterProduct.id}`)
    expect(newSlot).toBeDefined()
    expect(newSlot?.required).toBe(false)
    expect(newSlot?.canRemove).toBe(true)
    expect(newSlot?.displayOrder).toBeGreaterThan(
      Math.max(...bp.slots.map((s) => s.displayOrder)),
    )
  })

  it('removeOptionalSlot removes an optional slot', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const boosterProduct = MOCK_CATALOGUE.find((p) => p.isBoosterEligible)!
    const withBooster = addBoosterSlot(bp, {
      slotId: `booster-${boosterProduct.id}`,
      slotType: boosterProduct.stackSlots[0],
      title: 'Recovery',
      description: '',
      recommendedProductId: boosterProduct.id,
      selectedProductId: boosterProduct.id,
      selectedVariantId: null,
      required: false,
      canSwap: true,
      swapGroup: boosterProduct.swapGroup,
      reason: 'Good for recovery',
      confidenceScore: 70,
    })
    const removed = removeOptionalSlot(withBooster, `booster-${boosterProduct.id}`)
    expect(removed.slots.find((s) => s.slotId === `booster-${boosterProduct.id}`)).toBeUndefined()
  })

  it('removeOptionalSlot throws when attempting to remove a required slot', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const proteinSlot = bp.slots.find((s) => s.slotType === 'protein')!
    expect(() => removeOptionalSlot(bp, proteinSlot.slotId)).toThrow()
  })

  it('adding a booster increases the total price', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const boosterProduct = MOCK_CATALOGUE.find((p) => p.isBoosterEligible)!
    const firstVariant = boosterProduct.variants.find((v) => v.available) ?? boosterProduct.variants[0]
    const withBooster = addBoosterSlot(bp, {
      slotId: `booster-${boosterProduct.id}`,
      slotType: boosterProduct.stackSlots[0],
      title: 'Recovery',
      description: '',
      recommendedProductId: boosterProduct.id,
      selectedProductId: boosterProduct.id,
      selectedVariantId: firstVariant?.id ?? null,
      required: false,
      canSwap: true,
      swapGroup: boosterProduct.swapGroup,
      reason: 'Good for recovery',
      confidenceScore: 70,
    })
    const priceBefore = calculatePricing(bp, MOCK_CATALOGUE).oneOffTotal
    const priceAfter = calculatePricing(withBooster, MOCK_CATALOGUE).oneOffTotal
    expect(priceAfter).toBeGreaterThan(priceBefore)
  })

  it('removing a booster decreases the total price', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const boosterProduct = MOCK_CATALOGUE.find((p) => p.isBoosterEligible)!
    const firstVariant = boosterProduct.variants.find((v) => v.available) ?? boosterProduct.variants[0]
    const boosterId = `booster-${boosterProduct.id}`
    const withBooster = addBoosterSlot(bp, {
      slotId: boosterId,
      slotType: boosterProduct.stackSlots[0],
      title: 'Recovery',
      description: '',
      recommendedProductId: boosterProduct.id,
      selectedProductId: boosterProduct.id,
      selectedVariantId: firstVariant?.id ?? null,
      required: false,
      canSwap: true,
      swapGroup: boosterProduct.swapGroup,
      reason: 'Good for recovery',
      confidenceScore: 70,
    })
    const withoutBooster = removeOptionalSlot(withBooster, boosterId)
    const priceWith = calculatePricing(withBooster, MOCK_CATALOGUE).oneOffTotal
    const priceWithout = calculatePricing(withoutBooster, MOCK_CATALOGUE).oneOffTotal
    expect(priceWithout).toBeLessThan(priceWith)
  })

  it('isBoosterEligible products exist in MOCK_CATALOGUE', () => {
    const boosters = MOCK_CATALOGUE.filter((p) => p.isBoosterEligible)
    expect(boosters.length).toBeGreaterThan(0)
  })
})

// ─── Feature 8: Dynamic pricing ───────────────────────────────────────────────

describe('Feature 8: dynamic pricing', () => {
  it('calculatePricing returns consistent oneOffTotal across mutations', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const p1 = calculatePricing(bp, MOCK_CATALOGUE).oneOffTotal
    const p2 = calculatePricing(bp, MOCK_CATALOGUE).oneOffTotal
    expect(p1).toBe(p2)
  })

  it('subscription price is always <= one-off price', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const { oneOffTotal, subscriptionTotal } = calculatePricing(bp, MOCK_CATALOGUE)
    expect(subscriptionTotal).toBeLessThanOrEqual(oneOffTotal)
  })

  it('subscription saving % is correct', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const { oneOffTotal, subscriptionTotal, subscriptionSaving, subscriptionSavingPct } = calculatePricing(bp, MOCK_CATALOGUE)
    if (subscriptionSaving > 0) {
      const expectedPct = Math.round((subscriptionSaving / oneOffTotal) * 100)
      expect(subscriptionSavingPct).toBe(expectedPct)
    }
  })

  it('bundleSaving equals rrpTotal - oneOffTotal', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const { rrpTotal, oneOffTotal, bundleSaving } = calculatePricing(bp, MOCK_CATALOGUE)
    expect(Math.round(bundleSaving * 100)).toBe(Math.round((rrpTotal - oneOffTotal) * 100))
  })

  it('prices are rounded to 2 decimal places', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const { oneOffTotal, subscriptionTotal, rrpTotal } = calculatePricing(bp, MOCK_CATALOGUE)
    expect(oneOffTotal).toBe(Math.round(oneOffTotal * 100) / 100)
    expect(subscriptionTotal).toBe(Math.round(subscriptionTotal * 100) / 100)
    expect(rrpTotal).toBe(Math.round(rrpTotal * 100) / 100)
  })

  it('PRICING_CONFIG.subscriptionDiscount is applied only to eligible products', () => {
    // Create a blueprint where all selected products have subscriptionEligible=true
    const allEligible = MOCK_CATALOGUE.map((p) => ({ ...p, subscriptionEligible: true }))
    const bp = buildStackBlueprint(BASE_ANSWERS, allEligible)
    const { oneOffTotal, subscriptionTotal } = calculatePricing(bp, allEligible)
    if (oneOffTotal > 0) {
      const expectedSub = Math.round(oneOffTotal * (1 - PRICING_CONFIG.subscriptionDiscount) * 100) / 100
      expect(Math.abs(subscriptionTotal - expectedSub)).toBeLessThan(0.02) // rounding tolerance
    }
  })
})

// ─── Feature 9: Checkout validation ──────────────────────────────────────────

describe('Feature 9: checkout validation', () => {
  it('validateCheckout succeeds in mock mode for a generated blueprint', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const result = validateCheckout(bp, MOCK_CATALOGUE, { requireShopifyIds: false })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lines.length).toBeGreaterThan(0)
  })

  it('each line item has the required source attribute', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const result = validateCheckout(bp, MOCK_CATALOGUE, { requireShopifyIds: false })
    if (!result.ok) return
    for (const line of result.lines) {
      const sourceAttr = line.attributes.find((a) => a.key === 'source')
      expect(sourceAttr?.value).toBe('quiz-stack-builder')
    }
  })

  it('each line item carries the stackName attribute', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const result = validateCheckout(bp, MOCK_CATALOGUE, { requireShopifyIds: false })
    if (!result.ok) return
    for (const line of result.lines) {
      const nameAttr = line.attributes.find((a) => a.key === 'stackName')
      expect(nameAttr?.value).toBe(bp.stackName)
    }
  })

  it('products added as boosters are included in checkout lines', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const booster = MOCK_CATALOGUE.find((p) => p.isBoosterEligible)!
    const firstVariant = booster.variants.find((v) => v.available)!
    const withBooster = addBoosterSlot(bp, {
      slotId: `booster-${booster.id}`,
      slotType: booster.stackSlots[0],
      title: 'Recovery',
      description: '',
      recommendedProductId: booster.id,
      selectedProductId: booster.id,
      selectedVariantId: firstVariant.id,
      required: false,
      canSwap: true,
      swapGroup: booster.swapGroup,
      reason: 'Recovery support',
      confidenceScore: 70,
    })
    const result = validateCheckout(withBooster, MOCK_CATALOGUE, { requireShopifyIds: false })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lines.length).toBe(withBooster.slots.length)
  })

  it('removed optional products are excluded from checkout lines', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const optionalSlot = bp.slots.find((s) => !s.required)
    if (!optionalSlot) return

    const reduced = removeOptionalSlot(bp, optionalSlot.slotId)
    const original = validateCheckout(bp, MOCK_CATALOGUE, { requireShopifyIds: false })
    const trimmed = validateCheckout(reduced, MOCK_CATALOGUE, { requireShopifyIds: false })
    if (!original.ok || !trimmed.ok) return
    expect(trimmed.lines.length).toBe(original.lines.length - 1)
  })

  it('swapped product is used in checkout, not the original', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const proteinSlot = bp.slots.find((s) => s.slotType === 'protein')!
    const alternatives = getSwappableProductsForSlot(proteinSlot, MOCK_CATALOGUE)
    if (alternatives.length === 0) return

    const newProduct = alternatives[0]
    const firstVariant = newProduct.variants.find((v) => v.available) ?? newProduct.variants[0]
    let swapped = updateStackSlotProduct(bp, proteinSlot.slotId, newProduct.id)
    if (firstVariant) swapped = updateStackSlotVariant(swapped, proteinSlot.slotId, firstVariant.id)

    const result = validateCheckout(swapped, MOCK_CATALOGUE, { requireShopifyIds: false })
    if (!result.ok) return
    const proteinLine = result.lines.find((l) => {
      const attr = l.attributes.find((a) => a.key === 'slotType')
      return attr?.value === 'protein'
    })
    expect(proteinLine?.merchandiseId).toBe(firstVariant?.id ?? newProduct.id)
  })

  it('fails validation in live mode when shopifyVariantId is null', () => {
    const bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    // MOCK_CATALOGUE products all have shopifyVariantId: null
    const result = validateCheckout(bp, MOCK_CATALOGUE, { requireShopifyIds: true })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].type).toBe('no-shopify-id')
  })
})

// ─── Cross-feature: full stack mutation cycle ─────────────────────────────────

describe('Full stack mutation cycle', () => {
  it('swap → variant change → add booster → remove optional → checkout produces correct line count', () => {
    let bp = buildStackBlueprint(BASE_ANSWERS, MOCK_CATALOGUE)
    const initialSlotCount = bp.slots.length

    // Swap protein
    const proteinSlot = bp.slots.find((s) => s.slotType === 'protein')!
    const altProteins = getSwappableProductsForSlot(proteinSlot, MOCK_CATALOGUE)
    if (altProteins.length > 0) {
      const newProt = altProteins[0]
      const v = newProt.variants.find((vv) => vv.available) ?? newProt.variants[0]
      bp = updateStackSlotProduct(bp, proteinSlot.slotId, newProt.id)
      if (v) bp = updateStackSlotVariant(bp, proteinSlot.slotId, v.id)
    }

    // Change a variant
    const anySlot = bp.slots[0]
    const product = MOCK_CATALOGUE.find((p) => p.id === anySlot.selectedProductId)
    const anotherVariant = product?.variants.find((v) => v.id !== anySlot.selectedVariantId && v.available)
    if (anotherVariant) {
      bp = updateStackSlotVariant(bp, anySlot.slotId, anotherVariant.id)
    }

    // Add booster
    const booster = MOCK_CATALOGUE.find((p) => p.isBoosterEligible && !bp.slots.some((s) => s.selectedProductId === p.id))
    const boosterId = booster ? `booster-${booster.id}` : null
    if (booster && boosterId) {
      const bv = booster.variants.find((v) => v.available) ?? booster.variants[0]
      bp = addBoosterSlot(bp, {
        slotId: boosterId,
        slotType: booster.stackSlots[0],
        title: 'Booster',
        description: '',
        recommendedProductId: booster.id,
        selectedProductId: booster.id,
        selectedVariantId: bv?.id ?? null,
        required: false,
        canSwap: true,
        swapGroup: booster.swapGroup,
        reason: 'Test booster',
        confidenceScore: 60,
      })
    }

    // Remove an optional slot
    const optional = bp.slots.find((s) => !s.required && s.slotId !== boosterId)
    if (optional) {
      bp = removeOptionalSlot(bp, optional.slotId)
    }

    // Verify pricing is consistent
    const pricing = calculatePricing(bp, MOCK_CATALOGUE)
    expect(pricing.oneOffTotal).toBeGreaterThan(0)
    expect(pricing.subscriptionTotal).toBeLessThanOrEqual(pricing.oneOffTotal)

    // Verify checkout lines match current slot count
    const result = validateCheckout(bp, MOCK_CATALOGUE, { requireShopifyIds: false })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.lines.length).toBe(bp.slots.length)
  })
})
