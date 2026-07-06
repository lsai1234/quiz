import type { StackBlueprint } from '@/lib/stack-blueprint'
import type { StackSlot } from '@/lib/catalogue/types'

// ─── Prebuilt bundles ─────────────────────────────────────────────────────────
// A prebuilt bundle is a curated, creator-led stack with its own landing page:
// the normal stack checkout plus the content that sells it (the workout, the
// how-to, the claim-safe story). Unlike quiz stacks it is fixed data — no
// engine, no personalisation — so it can ship at a permanent URL.

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
  /** e.g. "Big Night, Big Morning" */
  name: string
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
  workout: BundleWorkout
  howToUse: BundleHowToStep[]
  /** Bundle-specific disclaimer, shown above the standard supplements fine print. */
  disclaimer: string
  metaTitle: string
  metaDescription: string
}
