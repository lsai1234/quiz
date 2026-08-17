import { readFileSync } from 'fs'
import { join } from 'path'
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
 */

const ART_DIR = join(process.cwd(), 'src/lib/share-card/art')

export type ArtKey = 'strength' | 'performance' | 'energy' | 'recovery' | 'wellbeing' | 'hydration'

export const ART_KEYS: ArtKey[] = [
  'strength', 'performance', 'energy', 'recovery', 'wellbeing', 'hydration',
]

interface ArtEntry {
  /** What the finished image has to be. Kept next to the code because a brief in
   *  a separate document is a brief nobody reads before shipping a replacement. */
  brief: string
  /** The file in `art/`. */
  file: string
  /** True while this is standing in for art that has not been made. */
  placeholder: boolean
}

export const ART_SET: Record<ArtKey, ArtEntry> = {
  strength: {
    brief: 'Heavy, dense, low light. Loaded barbell or plates, deep shadow, one cyan rim light.',
    file: 'bottle.png',
    placeholder: true,
  },
  performance: {
    brief: 'Motion. A body mid-effort, sharp, cyan edge light, dark ground — speed rather than gym.',
    file: 'capsule-1.png',
    placeholder: true,
  },
  energy: {
    brief: 'Charge. Electric, high contrast, cyan and violet, abstract rather than literal.',
    file: 'capsule-1.png',
    placeholder: true,
  },
  recovery: {
    brief: 'Stillness after effort. Cool, quiet, low key. Steam, water, a body at rest.',
    file: 'capsule-3.png',
    placeholder: true,
  },
  wellbeing: {
    brief: 'Daylight and calm. Softer, warmer than the rest, but still on a near-black ground.',
    file: 'lid.png',
    placeholder: true,
  },
  hydration: {
    brief: 'Liquid. Pour, splash or condensation, cyan through it, hard specular highlights.',
    file: 'bottle.png',
    placeholder: true,
  },
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

const cache = new Map<string, string>()

function dataUri(file: string): string {
  const hit = cache.get(file)
  if (hit) return hit
  const uri = `data:image/png;base64,${readFileSync(join(ART_DIR, file)).toString('base64')}`
  cache.set(file, uri)
  return uri
}

/**
 * The image for the card.
 *
 * A real catalogue image wins when the payload carries one — that path exists so
 * the day there is proper photography it is a data change — and otherwise the
 * family's art is used.
 */
export function cardArt(key: ArtKey | undefined, imageUrl?: string | null): string {
  if (imageUrl) return imageUrl
  return dataUri(ART_SET[key ?? 'wellbeing'].file)
}

/** Whether this family is still standing in for art that has not been made. */
export function isPlaceholder(key: ArtKey | undefined): boolean {
  return ART_SET[key ?? 'wellbeing'].placeholder
}
