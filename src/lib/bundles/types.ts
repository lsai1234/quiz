import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { StackSlot } from '@/lib/catalogue/types'

// ─── Prebuilt bundles ─────────────────────────────────────────────────────────
// A prebuilt bundle is a curated, creator-led stack with its own landing page:
// the normal stack checkout plus the content that sells it (the workout, the
// how-to, the claim-safe story). Unlike quiz stacks it is fixed data — no
// engine, no personalisation — so it can ship at a permanent URL.
//
// Bundles are authored as seed data (`seeds.ts`) and can also be created,
// edited and removed by founders via the portal, which persists overrides and
// founder-authored bundles in the database (see `lib/bundles/store.ts`). Prices
// are never stored on the bundle — they are computed live from the catalogue
// through `stack-blueprint/pricing`, so a pricing change never leaves a bundle
// quoting a stale total.

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

export interface PrebuiltBundle {
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
  /** The fixed stack sold on this page. */
  blueprint: StackBlueprint
  addOns: BundleAddOn[]
  /**
   * The workouts that come with this package — one to many.
   *
   * It was exactly one, which is a limit that came from the data shape rather
   * than from anything true: a strength package is a week of sessions, not one
   * session, and the second one had nowhere to live. Ordered — first is the one
   * the page leads with.
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
