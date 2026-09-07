import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { StackSlot } from '@/lib/catalogue/types'

// ─── Two things, not one ──────────────────────────────────────────────────────
//
// A PRE-BUILT BUNDLE is a stack of products with a name — "Strength", "Fitness".
// There are two of them. It has no workout, no landing page and no story; it is
// the products, and the reasons they are together.
//
// A WORKOUT BUNDLE is what a customer buys: one workout, plus one of the
// pre-built bundles. It owns the name, the photograph, the copy and the session,
// and it points at a pre-built bundle for everything product-shaped. It is what
// the shop shelf shows and what `/bundles/[slug]` renders.
//
// The relationship is one to many: one pre-built bundle serves as many workout
// bundles as there are workouts worth selling. That is the whole reason for the
// split — a stack was copied into every package that used it, so a product
// swapped out of "Strength" had to be swapped out of each one by hand.
//
// Prices live in neither. They are computed from the catalogue on read
// (`stack-blueprint/pricing`), so nothing here can quote a stale total.
//
// Seeds (`seeds.ts`) ship the workout bundles; pre-built bundles are authored
// entirely in the Hub, because which products go together is a decision that
// changes with the range and does not belong in a deploy.

export interface WorkoutExercise {
  name: string
  /** Sets × reps prescription, e.g. "3 × 10" or "3 × 30 seconds" */
  prescription: string
}

export interface BundleWorkout {
  /** e.g. "Full Body Reset" */
  title: string
  intro: string
  warmup: string
  exercises: WorkoutExercise[]
  /** The intensity rule, e.g. "Leave 2–3 reps in the tank. No maxing out." */
  rule: string
  finisher: string
  postWorkout: string
}

export interface BundleHowToStep {
  title: string
  detail: string
}

/** An optional product the visitor can toggle into the bundle before checkout. */
export interface BundleAddOn {
  slotId: string
  slotType: StackSlot
  /** Slot chip label, e.g. "Evening Reset" */
  title: string
  productId: string
  reason: string
}

/**
 * A pre-built bundle: a named stack of products, and nothing else.
 *
 * No workout, no tagline, no landing page — a workout bundle wraps it in those.
 * Several workout bundles can point at the same one, which is the point: edit
 * the Strength stack once and every session built on it follows.
 */
export interface ProductBundle {
  /** Stable id, used as the reference from a workout bundle. */
  slug: string
  /** What the founder calls this stack — "Strength", "Fitness". */
  name: string
  /** One line on what it is for. Shown in the Hub's picker, not to customers. */
  description: string
  /** The fixed stack. Built from the chosen products by `assembleProductBundle`. */
  blueprint: StackBlueprint
  /** Optional products a visitor can toggle in before checkout. */
  addOns: BundleAddOn[]
  /** Lower sorts first in the Hub's list. */
  displayOrder?: number
}

export interface WorkoutBundle {
  /** URL segment the bundle lives at, e.g. "big-night-big-morning" */
  slug: string
  /**
   * What the PACKAGE is called — the stack and its workouts together, which is
   * the thing that is actually sold and the name the shop puts on the card.
   *
   * Not the stack's name and not a workout's name. A bundle is one shelf item
   * made of two halves, and naming the halves separately is what left the shop
   * card leading with a series label and a product count.
   */
  name: string
  /**
   * The package's photograph.
   *
   * A bundle card used to draw its own picture by stacking the first three
   * products' cutouts on a lit ground, which is the best a card can do with no
   * image and reads as three tubs in a row wherever it is put. A bundle is sold
   * on what it is FOR — the session, the morning, the week — and that is a
   * photograph, not a shelf of packaging.
   *
   * Absent falls back to the product strip, so a bundle without one still has a
   * card. Set in the Hub.
   */
  imageUrl?: string | null
  /** e.g. "Hydrate. Move. Refuel. Reset." */
  tagline: string
  /** The recurring content series this bundle belongs to. */
  seriesName: string
  description: string
  /** The cheeky-but-honest positioning line (also keeps claims safe). */
  honestyLine: string
  /**
   * The pre-built bundle this package sells.
   *
   * The products are not stored here. A workout bundle IS a workout plus one of
   * the pre-built stacks, so the stack is referenced rather than copied — which
   * is what lets one stack serve every session built on it.
   *
   * Null is a real state, not a broken one: a workout bundle can be written
   * before anybody has decided which stack it sells. It cannot be published or
   * bought until it points somewhere (readiness says so, and the shop hides it).
   */
  productBundleSlug: string | null
  /**
   * The workouts that come with this package.
   *
   * It was exactly one, which is a limit that came from the data shape rather
   * than from anything true: a strength package is a week of sessions, not one
   * session, and the second one had nowhere to live. Ordered — first is the one
   * the page leads with.
   *
   * Normally one — a workout bundle is a session and a stack. The list is there
   * because a package that is a week of training is the same object with three
   * sessions in it, and the alternative was three packages selling one stack.
   *
   * Empty is allowed and readiness warns about it, the way one missing workout
   * always did.
   */
  workouts: BundleWorkout[]
  /**
   * The single workout this replaced.
   *
   * Still read, never written: every bundle a founder has already saved carries
   * one, and those live in the database rather than in this repository, so the
   * field cannot simply be deleted. `bundleWorkouts()` is the only thing that
   * should look at it — it resolves the two into the list everything else uses,
   * and `composeBundles` normalises stored bundles on the way in.
   *
   * @deprecated Read `workouts` through `bundleWorkouts()`.
   */
  workout?: BundleWorkout
  howToUse: BundleHowToStep[]
  /** Bundle-specific disclaimer, shown above the standard supplements fine print. */
  disclaimer: string
  metaTitle: string
  metaDescription: string
  /**
   * Curation state, managed by the portal. Absent on seed data means published
   * and ordered by registration order; the store fills these in.
   */
  /** Lower sorts first in the shop bundles row. */
  displayOrder?: number
  /** When false, the bundle is a draft: hidden from the shop and public API. */
  published?: boolean
  /** True for founder-authored bundles (vs shipped seeds). Informational. */
  custom?: boolean
}
