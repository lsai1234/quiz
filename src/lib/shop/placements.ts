/**
 * Where hero artwork goes in the shop.
 *
 * ── Why this is a registry and not a list of banners ────────────────────────
 * The first version of this was a generic list: upload artwork, give it a
 * position number, and the shop stacked whatever it got at the top of the page.
 * That is a carousel with extra steps. It put every picture in one place, made
 * every picture the same shape, and gave a founder no way to say "this one is
 * the thing at the top" and "this one breaks up the shelves halfway down".
 *
 * A shop that reads as designed does the opposite: a few FIXED positions in the
 * layout, each with its own shape and its own job, each filled deliberately.
 * So the placements are declared here, the shop renders them by name, and the
 * Founders Hub shows one upload for each — a person is choosing "the picture
 * between Protein and Hydration", not "banner number 3".
 *
 * ── Why the shapes differ on purpose ────────────────────────────────────────
 * Three ratios, because three jobs. A 16:9 masthead has the presence to open a
 * page. A pair of 4:5 portraits reads as two things you can go into, and
 * portrait is the only shape that survives sitting next to another one. A 2.4:1
 * interstitial is too short to be a page-opener, which is exactly why it works
 * between two shelves — it breaks the rhythm of product rows without
 * pretending to be a new page.
 *
 * Adding a placement is a matter of adding an entry here and rendering it. The
 * validation, the Hub screen, the guidance text and the upload rules all come
 * from this file, so none of them can drift from the others.
 *
 * Pure: no database, no DOM.
 */

/** How much copy is drawn over the art, which decides the fields the Hub shows. */
export type PlacementCopy =
  /** Headline, subhead and a link. The full editorial treatment. */
  | 'full'
  /** A short label and a link. Anything longer does not fit a portrait tile. */
  | 'label'

export interface Placement {
  id: string
  /** What the founder calls it. */
  label: string
  /** Where it appears, in a sentence, for the Hub. */
  where: string
  /** What it is for, so an empty one is a decision rather than an oversight. */
  purpose: string
  /** width / height. */
  ratio: number
  /** What to generate. Rendered at 2x on the widest phone, rounded up. */
  target: { width: number; height: number }
  /** Below this it is visibly soft on a 3x display. */
  min: { width: number; height: number }
  copy: PlacementCopy
  maxHeadline: number
  maxSubhead: number
  /**
   * Does the shop draw something when this is empty?
   *
   * Only the masthead does. An empty space at the top of the shop is a hole in
   * the page, so it falls back to a built banner made from product photography.
   * Every other placement simply is not there when it is not set, and the page
   * closes up around it — an interstitial that renders as a grey rectangle
   * because nobody uploaded anything is worse than one shelf meeting the next.
   */
  fallback: boolean
  /** Sort order in the Hub, top of the page first. */
  order: number
}

/**
 * The fixed positions, in the order they appear down the page.
 *
 * The two `duo` entries are separate placements rather than one placement that
 * takes two images, because they are two different pictures with two different
 * links and a founder should be able to change one without touching the other.
 */
export const PLACEMENTS: Placement[] = [
  {
    id: 'masthead',
    label: 'Masthead',
    where: 'The top of the shop, under the title.',
    purpose: 'The one picture everybody sees. Point it at the quiz or the season.',
    ratio: 16 / 9,
    target: { width: 1280, height: 720 },
    min: { width: 1024, height: 576 },
    copy: 'full',
    maxHeadline: 32,
    maxSubhead: 64,
    fallback: true,
    order: 1,
  },
  {
    id: 'duo-a',
    label: 'Twin tile — left',
    where: 'Left of the pair, under the goal row.',
    purpose: 'A category worth going into. Reads as a door, not an advert.',
    ratio: 4 / 5,
    target: { width: 1000, height: 1250 },
    min: { width: 800, height: 1000 },
    copy: 'label',
    maxHeadline: 18,
    maxSubhead: 32,
    fallback: false,
    order: 2,
  },
  {
    id: 'duo-b',
    label: 'Twin tile — right',
    where: 'Right of the pair, under the goal row.',
    purpose: 'The other door. Works best against the left tile, not echoing it.',
    ratio: 4 / 5,
    target: { width: 1000, height: 1250 },
    min: { width: 800, height: 1000 },
    copy: 'label',
    maxHeadline: 18,
    maxSubhead: 32,
    fallback: false,
    order: 3,
  },
  {
    id: 'break-1',
    label: 'First break',
    where: 'Between the second and third product shelves.',
    purpose: 'Stops the shelves reading as one long list. Best as a single object, close up.',
    ratio: 12 / 5,
    target: { width: 1440, height: 600 },
    min: { width: 1200, height: 500 },
    copy: 'full',
    maxHeadline: 32,
    maxSubhead: 64,
    fallback: false,
    order: 4,
  },
  {
    id: 'break-2',
    label: 'Second break',
    where: 'Further down, between the fifth and sixth shelves.',
    purpose: 'Catches somebody who has scrolled a long way. A different mood to the first.',
    ratio: 12 / 5,
    target: { width: 1440, height: 600 },
    min: { width: 1200, height: 500 },
    copy: 'full',
    maxHeadline: 32,
    maxSubhead: 64,
    fallback: false,
    order: 5,
  },
]

/**
 * Which shelf each break sits AFTER, counting the shelves the shop actually
 * renders. Kept here rather than in the shell so the Hub's "where" text and the
 * real position cannot disagree.
 */
export const BREAK_AFTER_SHELF: Record<string, number> = {
  'break-1': 2,
  'break-2': 5,
}

const BY_ID = new Map(PLACEMENTS.map((p) => [p.id, p]))

export function placement(id: string): Placement | null {
  return BY_ID.get(id) ?? null
}

export function isPlacementId(id: string): boolean {
  return BY_ID.has(id)
}

/** The placements in Hub order. */
export function placementsInOrder(): Placement[] {
  return [...PLACEMENTS].sort((a, b) => a.order - b.order)
}

/** `1280x720` — for the guidance text and the error messages. */
export function targetLabel(p: Placement): string {
  return `${p.target.width}x${p.target.height}`
}

/** `16:9`, `4:5` — read off the target rather than derived from the float. */
export function ratioLabel(p: Placement): string {
  const divisor = gcd(p.target.width, p.target.height)
  return `${p.target.width / divisor}:${p.target.height / divisor}`
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}
