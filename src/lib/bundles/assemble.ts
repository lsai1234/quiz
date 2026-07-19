import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { Goal } from '@/lib/types'
import { calculatePricing } from '@/lib/stack-blueprint/pricing'
import { bundleBlueprint } from './builders'
import type { PrebuiltBundle, BundleWorkout, BundleHowToStep, BundleAddOn } from './types'

/**
 * The editable shape the portal bundle editor works with — a flattened,
 * form-friendly view of a bundle. `assembleBundle` turns it back into a full
 * PrebuiltBundle (building the blueprint from the chosen core products).
 */
export interface BundleDraft {
  slug: string
  name: string
  tagline: string
  seriesName: string
  description: string
  honestyLine: string
  disclaimer: string
  metaTitle: string
  metaDescription: string
  published: boolean
  primaryGoal: Goal
  /** Chosen core products, in display order. */
  cores: { productId: string; title: string; reason: string }[]
  addOns: { productId: string; title: string; reason: string }[]
  workout: BundleWorkout
  howToUse: BundleHowToStep[]
}

export const EMPTY_WORKOUT: BundleWorkout = {
  title: '',
  intro: '',
  warmup: '',
  exercises: [{ name: '', prescription: '' }],
  rule: '',
  finisher: '',
  postWorkout: '',
}

/** A blank draft to start a new bundle from. */
export function emptyDraft(): BundleDraft {
  return {
    slug: '',
    name: '',
    tagline: '',
    seriesName: '',
    description: '',
    honestyLine: '',
    disclaimer: '',
    metaTitle: '',
    metaDescription: '',
    published: false,
    primaryGoal: 'health',
    cores: [],
    addOns: [],
    workout: { ...EMPTY_WORKOUT, exercises: [{ name: '', prescription: '' }] },
    howToUse: [{ title: '', detail: '' }],
  }
}

/** Turn an existing bundle into an editable draft. */
export function bundleToDraft(bundle: PrebuiltBundle): BundleDraft {
  return {
    slug: bundle.slug,
    name: bundle.name,
    tagline: bundle.tagline,
    seriesName: bundle.seriesName,
    description: bundle.description,
    honestyLine: bundle.honestyLine,
    disclaimer: bundle.disclaimer,
    metaTitle: bundle.metaTitle,
    metaDescription: bundle.metaDescription,
    published: bundle.published !== false,
    primaryGoal: bundle.blueprint.primaryGoal,
    cores: bundle.blueprint.slots.map((s) => ({ productId: s.selectedProductId, title: s.title, reason: s.reason })),
    addOns: bundle.addOns.map((a) => ({ productId: a.productId, title: a.title, reason: a.reason })),
    workout: bundle.workout,
    howToUse: bundle.howToUse,
  }
}

/**
 * Assemble a full PrebuiltBundle from a draft, resolving each core product to
 * build the fixed blueprint. `products` is the catalogue the picker chose from.
 * Prices are computed for the stored estimate fields (the UI still prices live).
 */
export function assembleBundle(draft: BundleDraft, products: CatalogueProduct[]): PrebuiltBundle {
  const byId = new Map(products.map((p) => [p.id, p]))

  const cores = draft.cores
    .map((c) => {
      const product = byId.get(c.productId)
      if (!product) return null
      return {
        slotType: product.stackSlots[0] ?? 'health',
        title: c.title.trim() || product.category,
        description: c.title.trim() || product.category,
        productId: product.id,
        swapGroup: product.swapGroup,
        reason: c.reason.trim() || product.shortReason || product.description,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)

  const secondary = Array.from(
    new Set(
      cores
        .flatMap((c) => byId.get(c.productId)?.goals ?? [])
        .filter((g) => g !== draft.primaryGoal),
    ),
  ).slice(0, 2)

  const blueprint = bundleBlueprint({
    slug: draft.slug,
    name: draft.name,
    summary: draft.tagline || draft.description.slice(0, 120),
    primaryGoal: draft.primaryGoal,
    secondaryGoals: secondary,
    profile: draft.seriesName,
    cores,
    estOneOff: 0,
    estSub: 0,
  })

  // Fill the stored estimate fields from a live computation (display still uses
  // live pricing; these are only a snapshot for the type's required fields).
  const pricing = calculatePricing(blueprint, products)
  blueprint.estimatedOneOffPrice = pricing.oneOffTotal
  blueprint.estimatedSubscriptionPrice = pricing.subscriptionTotal

  const addOns: BundleAddOn[] = draft.addOns
    .map((a, i) => {
      const product = byId.get(a.productId)
      if (!product) return null
      return {
        slotId: `${draft.slug}-addon-${i}`,
        slotType: product.stackSlots[0] ?? 'health',
        title: a.title.trim() || product.category,
        productId: product.id,
        reason: a.reason.trim() || product.shortReason || product.description,
      }
    })
    .filter((a): a is BundleAddOn => a !== null)

  return {
    slug: draft.slug,
    name: draft.name,
    tagline: draft.tagline,
    seriesName: draft.seriesName,
    description: draft.description,
    honestyLine: draft.honestyLine,
    blueprint,
    addOns,
    workout: {
      ...draft.workout,
      exercises: draft.workout.exercises.filter((e) => e.name.trim()),
    },
    howToUse: draft.howToUse.filter((s) => s.title.trim()),
    disclaimer: draft.disclaimer,
    metaTitle: draft.metaTitle || `${draft.name} | CHRGD`,
    metaDescription: draft.metaDescription || draft.description.slice(0, 155),
    published: draft.published,
    custom: true,
  }
}
