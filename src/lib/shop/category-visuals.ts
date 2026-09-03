import { hashString } from './ratings'

/**
 * Colour coding for shop categories.
 *
 * The category chip on a product card used to take its colour from the
 * product's first stack slot, which meant two products sitting side by side in
 * the same section — same chip text — could be two different colours. The chip
 * says "Creatine", so it has to be the same colour on every creatine product.
 *
 * Colour is therefore keyed on the category name and nothing else. Categories
 * the shop curates get a hand-picked hue (so the common sections stay visually
 * distinct from each other); anything else — supplier categories arrive as free
 * text and change without us — falls back to a stable hash into the same
 * palette, so an unknown category is still one consistent colour everywhere it
 * appears.
 *
 * The brand cyan is deliberately absent: it belongs to prices, CTAs and the
 * merchandising badge that sits directly beside this chip.
 */

/** Category hues: bright enough for 8px uppercase type on the dark surface,
 *  and spaced far enough apart to read as different at chip size. */
const PALETTE = [
  '#A78BFA', // violet
  '#818CF8', // indigo
  '#60A5FA', // blue
  '#2DD4BF', // teal
  '#34D399', // emerald
  '#A3E635', // lime
  '#FBBF24', // amber
  '#FB923C', // orange
  '#F87171', // red
  '#FB7185', // rose
  '#F472B6', // pink
  '#C084FC', // purple
] as const

/** Curated hues for the categories the shop groups itself. Keys are normalised
 *  (see `normalise`), so casing and punctuation in the catalogue don't matter. */
const CURATED: Record<string, string> = {
  protein: '#A78BFA',
  performance: '#FB923C',
  creatine: '#818CF8',
  'creatine supplements': '#818CF8',
  'pre workout': '#FBBF24',
  'amino acids': '#2DD4BF',
  endurance: '#F87171',
  hydration: '#60A5FA',
  recovery: '#34D399',
  health: '#FB7185',
  'gut health': '#A3E635',
  sleep: '#C084FC',
  'menopause support': '#F472B6',
}

/** Lowercase, collapse punctuation/whitespace — "Pre-Workout" and "pre workout"
 *  are the same category as far as colour is concerned. */
function normalise(category: string): string {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * The signature hue for a category. Stable: the same category string always
 * returns the same colour, whatever product it came from.
 */
export function categoryHue(category: string | null | undefined): string {
  const key = normalise(category || '')
  if (!key) return PALETTE[0]
  return CURATED[key] ?? PALETTE[hashString(key) % PALETTE.length]
}
