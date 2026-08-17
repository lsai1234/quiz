import type { Goal } from '@/lib/types'

/**
 * The card's picture.
 *
 * ── Six images, chosen by what the stack is for ─────────────────────────────
 * The card carries one image, picked from a fixed set of six rather than from
 * the catalogue. That is deliberate on two counts. Product photography is per
 * SKU and the card is about a *stack*, so a single bottle under a headline about
 * six products is the wrong picture. And a set small enough to art-direct
 * properly is a set that can actually look expensive — which is the whole job
 * the picture is doing here.
 *
 * The six are keyed to goal families, not shuffled, so the picture means
 * something: a strength stack gets the strength image every time, and two people
 * with the same goals get the same card. `docs/SHARE_CARD_ART_BRIEF.md` is what
 * each one has to be.
 *
 * ── They are placeholders today ─────────────────────────────────────────────
 * The finished art does not exist yet, so every family currently resolves to the
 * nearest of the four CHRGD renders the hero already uses. Dropping six files
 * into `art/` and pointing `ART_SET` at them is the whole change — no layout
 * work, no new code path. `isPlaceholder` is what `/styleguide/share` uses to
 * say so out loud, so nobody signs the card off believing this is the art.
 *
 * ── Frozen, like everything else on the card ────────────────────────────────
 * The chosen family is written into the payload at share time (`artKey`). A card
 * shared today has to keep its picture when the set is re-shot.
 *
 * ── No `fs` in this file ────────────────────────────────────────────────────
 * Reading the bytes lives in `art-file.ts`, which is server-only. This half is
 * imported by `format.ts`, which the share sheet needs in the browser, and a
 * top-level `import 'fs'` anywhere in that chain breaks the client bundle.
 */

export type ArtKey = 'strength' | 'performance' | 'energy' | 'recovery' | 'wellbeing' | 'hydration'

export const ART_KEYS: ArtKey[] = [
  'strength', 'performance', 'energy', 'recovery', 'wellbeing', 'hydration',
]

interface ArtEntry {
  /** What the finished image has to be. Kept next to the code because a brief in
   *  a separate document is a brief nobody reads before shipping a replacement. */
  brief: string
  /** The file in `art/`, once there is one. Null while the field stands in. */
  file: string | null
  /** True while this is standing in for art that has not been made. */
  placeholder: boolean
  /** The gradient stand-in, drawn when there is no file. See `ArtField`. */
  field: ArtField
}

/**
 * A photographic stand-in, built from gradients.
 *
 * ── Why not a stock render ──────────────────────────────────────────────────
 * The first version of this used the four CHRGD product renders as placeholders.
 * They were the wrong shape of wrong: a single 1080-tall bottle with the logo
 * printed across its belly sat directly under the headline and fought it, the
 * left third was the brightest part of the frame — exactly where the outlined
 * score is ghosted — and the picture said "one product" on a card about a stack.
 *
 * A gradient field says less, which is the point of a placeholder. It gives the
 * scrim something to grade into, keeps the left third dark by construction, and
 * cannot be mistaken for finished art in a review.
 *
 * ── Layers rather than one background ───────────────────────────────────────
 * Satori takes a single `backgroundImage` reliably and a comma-separated list
 * less so, so each layer is drawn as its own absolutely positioned div. Radial
 * gradients appear here and nowhere else on the card: inside the art they are
 * light falloff, which is what a photograph is made of. As UI they are the
 * "radial glow" the brief bans, and the rest of the card has none.
 */
export interface ArtField {
  /** The ground the layers sit on. */
  base: string
  /** Drawn over the base, in order. */
  layers: Array<{ image: string; opacity?: number }>
}

const INK = '#050608'

export const ART_SET: Record<ArtKey, ArtEntry> = {
  strength: {
    brief: 'Heavy, dense, low light. Loaded barbell or plates, deep shadow, one cyan rim light.',
    file: null,
    placeholder: true,
    field: {
      base: `linear-gradient(155deg, #0C1016 0%, ${INK} 58%, #04050A 100%)`,
      layers: [
        { image: 'radial-gradient(90% 65% at 88% 26%, rgba(34,211,238,0.30) 0%, rgba(34,211,238,0) 62%)' },
        { image: 'linear-gradient(255deg, rgba(139,92,246,0.20) 0%, rgba(139,92,246,0) 46%)' },
        { image: `linear-gradient(to bottom, rgba(5,6,8,0) 44%, ${INK} 96%)` },
      ],
    },
  },
  performance: {
    brief: 'Motion. A body mid-effort, sharp, cyan edge light, dark ground — speed rather than gym.',
    file: null,
    placeholder: true,
    field: {
      base: `linear-gradient(118deg, #04050A 0%, #0B121A 46%, ${INK} 100%)`,
      layers: [
        { image: 'linear-gradient(112deg, rgba(34,211,238,0) 48%, rgba(34,211,238,0.42) 63%, rgba(34,211,238,0) 71%)' },
        { image: 'radial-gradient(70% 50% at 74% 62%, rgba(139,92,246,0.22) 0%, rgba(139,92,246,0) 70%)' },
        { image: `linear-gradient(to bottom, rgba(5,6,8,0) 50%, ${INK} 97%)` },
      ],
    },
  },
  energy: {
    brief: 'Charge. Electric, high contrast, cyan and violet, abstract rather than literal.',
    file: null,
    placeholder: true,
    field: {
      base: `linear-gradient(180deg, #070A12 0%, ${INK} 70%)`,
      layers: [
        { image: 'radial-gradient(26% 58% at 69% 40%, rgba(34,211,238,0.52) 0%, rgba(34,211,238,0) 68%)' },
        { image: 'radial-gradient(60% 40% at 82% 66%, rgba(139,92,246,0.26) 0%, rgba(139,92,246,0) 72%)' },
        { image: `linear-gradient(to bottom, rgba(5,6,8,0) 46%, ${INK} 95%)` },
      ],
    },
  },
  recovery: {
    brief: 'Stillness after effort. Cool, quiet, low key. Steam, water, a body at rest.',
    file: null,
    placeholder: true,
    field: {
      base: `linear-gradient(190deg, #070C12 0%, ${INK} 62%, #04050A 100%)`,
      layers: [
        { image: 'linear-gradient(to bottom, rgba(34,211,238,0) 30%, rgba(34,211,238,0.20) 47%, rgba(34,211,238,0) 60%)' },
        { image: 'radial-gradient(80% 40% at 66% 34%, rgba(139,92,246,0.16) 0%, rgba(139,92,246,0) 74%)' },
        { image: `linear-gradient(to bottom, rgba(5,6,8,0) 52%, ${INK} 96%)` },
      ],
    },
  },
  wellbeing: {
    brief: 'Daylight and calm. Softer, warmer than the rest, but still on a near-black ground.',
    file: null,
    placeholder: true,
    field: {
      base: `linear-gradient(165deg, #0A0E14 0%, ${INK} 64%)`,
      layers: [
        { image: 'linear-gradient(128deg, rgba(34,211,238,0) 40%, rgba(34,211,238,0.26) 56%, rgba(34,211,238,0) 74%)' },
        { image: 'radial-gradient(66% 46% at 84% 18%, rgba(139,92,246,0.18) 0%, rgba(139,92,246,0) 68%)' },
        { image: `linear-gradient(to bottom, rgba(5,6,8,0) 48%, ${INK} 96%)` },
      ],
    },
  },
  hydration: {
    brief: 'Liquid. Pour, splash or condensation, cyan through it, hard specular highlights.',
    file: null,
    placeholder: true,
    field: {
      base: `linear-gradient(200deg, #05090F 0%, ${INK} 55%, #04050A 100%)`,
      layers: [
        { image: 'radial-gradient(18% 70% at 62% 44%, rgba(34,211,238,0.46) 0%, rgba(34,211,238,0) 70%)' },
        { image: 'radial-gradient(50% 34% at 86% 74%, rgba(139,92,246,0.20) 0%, rgba(139,92,246,0) 72%)' },
        { image: `linear-gradient(to bottom, rgba(5,6,8,0) 50%, ${INK} 96%)` },
      ],
    },
  },
}

/** The gradient stand-in for a family. */
export function artField(key: ArtKey | undefined): ArtField {
  return ART_SET[key ?? 'wellbeing'].field
}

/**
 * Which family a goal belongs to.
 *
 * Ordered by how strongly each goal implies a picture: `muscle` says strength
 * far more loudly than `health` says wellbeing, so the first match down the
 * user's own goal list wins rather than the most common one.
 */
const GOAL_FAMILY: Record<Goal, ArtKey> = {
  muscle: 'strength',
  bulking: 'strength',
  performance: 'performance',
  cutting: 'performance',
  energy: 'energy',
  focus: 'energy',
  recovery: 'recovery',
  'sleep-better': 'recovery',
  'less-stress': 'recovery',
  hydration: 'hydration',
  health: 'wellbeing',
  immune: 'wellbeing',
  'skin-hair-nails': 'wellbeing',
  menopause: 'wellbeing',
  'gut-health': 'wellbeing',
}

/**
 * The art family for a stack.
 *
 * Takes the goals in the customer's own order, so the picture follows what they
 * said mattered most. Drinks mode overrides everything — an LQD package is a
 * box of drinks whatever it is for, and the hydration image is the one that says
 * so.
 */
export function pickArtKey(goals: Goal[], drinksMode = false): ArtKey {
  if (drinksMode) return 'hydration'
  for (const goal of goals) {
    const family = GOAL_FAMILY[goal]
    if (family) return family
  }
  return 'wellbeing'
}

/** Whether this family is still standing in for art that has not been made. */
export function isPlaceholder(key: ArtKey | undefined): boolean {
  return ART_SET[key ?? 'wellbeing'].placeholder
}
