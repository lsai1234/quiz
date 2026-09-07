import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { Goal } from '@/lib/types'
import { calculatePricing } from '@/lib/stack-blueprint/pricing'
import { bundleBlueprint } from './builders'
import type { ProductBundle, WorkoutBundle, BundleWorkout, BundleHowToStep, BundleAddOn } from './types'
import { bundleWorkouts } from './resolve'

/**
 * The editable shapes the Hub's two bundle editors work with — flattened,
 * form-friendly views. `assembleProductBundle` and `assembleBundle` turn them
 * back into records.
 *
 * They are separate because the two things are separate: a pre-built bundle is
 * products and the reasons they are together; a workout bundle is a session, a
 * name, a photograph and a pointer at one of those stacks. One form asking for
 * both is what made every package carry its own copy of a stack.
 */

// ── The pre-built bundle: products only ───────────────────────────────────────

export interface ProductBundleDraft {
  slug: string
  name: string
  description: string
  primaryGoal: Goal
  /** Chosen products, in display order. */
  cores: { productId: string; title: string; reason: string }[]
  addOns: { productId: string; title: string; reason: string }[]
}

export function emptyProductBundleDraft(): ProductBundleDraft {
  return { slug: '', name: '', description: '', primaryGoal: 'health', cores: [], addOns: [] }
}

export function productBundleToDraft(bundle: ProductBundle): ProductBundleDraft {
  return {
    slug: bundle.slug,
    name: bundle.name,
    description: bundle.description,
    primaryGoal: bundle.blueprint.primaryGoal,
    cores: bundle.blueprint.slots.map((s) => ({ productId: s.selectedProductId, title: s.title, reason: s.reason })),
    addOns: bundle.addOns.map((a) => ({ productId: a.productId, title: a.title, reason: a.reason })),
  }
}

/** Build a pre-built bundle from a draft, resolving each product to a fixed slot. */
export function assembleProductBundle(draft: ProductBundleDraft, products: CatalogueProduct[]): ProductBundle {
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
      cores.flatMap((c) => byId.get(c.productId)?.goals ?? []).filter((g) => g !== draft.primaryGoal),
    ),
  ).slice(0, 2)

  const blueprint = bundleBlueprint({
    slug: draft.slug,
    name: draft.name,
    summary: draft.description.slice(0, 120),
    primaryGoal: draft.primaryGoal,
    secondaryGoals: secondary,
    profile: draft.name,
    cores,
    estOneOff: 0,
    estSub: 0,
  })

  // The stored estimates are a snapshot for the type's required fields; every
  // surface prices live from the catalogue.
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

  return { slug: draft.slug, name: draft.name, description: draft.description, blueprint, addOns }
}

// ── The workout bundle: a session, a story, and a stack to sell ───────────────

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
  /** The pre-built bundle this package sells. Empty until one is chosen. */
  productBundleSlug: string
  /** The package's own photograph. Empty means the card draws the product strip. */
  imageUrl: string
  /** The sessions that come with the package, in order. Normally one. */
  workouts: BundleWorkout[]
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

/** A blank draft to start a new workout bundle from. */
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
    productBundleSlug: '',
    imageUrl: '',
    workouts: [{ ...EMPTY_WORKOUT, exercises: [{ name: '', prescription: '' }] }],
    howToUse: [{ title: '', detail: '' }],
  }
}

/** Turn an existing workout bundle into an editable draft. */
export function bundleToDraft(bundle: WorkoutBundle): BundleDraft {
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
    productBundleSlug: bundle.productBundleSlug ?? '',
    imageUrl: bundle.imageUrl ?? '',
    // Through `bundleWorkouts`, because a bundle saved before the editor could
    // hold more than one still carries a single `workout` and nothing else.
    workouts: bundleWorkouts(bundle),
    howToUse: bundle.howToUse,
  }
}

/**
 * Assemble a workout bundle from a draft.
 *
 * No products pass through here. The stack is the pre-built bundle's, resolved
 * on read (`composeBundles`), so this cannot leave a stale copy of one behind —
 * which is the whole reason the two are separate records.
 */
export function assembleBundle(draft: BundleDraft): WorkoutBundle {
  return {
    slug: draft.slug,
    name: draft.name,
    tagline: draft.tagline,
    seriesName: draft.seriesName,
    description: draft.description,
    honestyLine: draft.honestyLine,
    productBundleSlug: draft.productBundleSlug.trim() || null,
    ...(draft.imageUrl.trim() ? { imageUrl: draft.imageUrl.trim() } : { imageUrl: null }),
    /*
      Blank rows are the editor's, not the bundle's: an empty exercise line is
      what an "Add exercise" press leaves behind until somebody types in it, and
      an entirely empty workout is a session that was started and abandoned.
      Neither should reach a page that is trying to sell something.
    */
    workouts: draft.workouts
      .map((w) => ({ ...w, exercises: w.exercises.filter((e) => e.name.trim()) }))
      .filter((w) => w.title.trim() || w.exercises.length > 0),
    howToUse: draft.howToUse.filter((s) => s.title.trim()),
    disclaimer: draft.disclaimer,
    metaTitle: draft.metaTitle || `${draft.name} | CHRGD`,
    metaDescription: draft.metaDescription || draft.description.slice(0, 155),
    published: draft.published,
    custom: true,
  }
}
