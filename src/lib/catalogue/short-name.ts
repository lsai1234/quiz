/**
 * The name a product goes by when there is no room for its real one.
 *
 * A product has two names and the catalogue has only ever stored one. `title` is
 * the full, unambiguous name — "Applied Nutrition Critical Whey Protein Isolate
 * Chocolate Fudge 900g" — and it is the right name on a receipt, an order
 * confirmation, or anything somebody might have to identify a tub from in a
 * dispute. `shortName` is what it is called on a card: "Whey Isolate".
 *
 * The share card is where this stops being cosmetic. The poster's spec table is
 * a fixed-width column, and the only thing standing between it and a real
 * supplier title was `title.replace(/^CHRGD\s+/i, '')` — which works solely
 * because every mock product happens to be called "CHRGD Something". Point it at
 * the roster in `docs/rosters/` and rows run off the card.
 *
 * ── Why a derivation and not just a field ───────────────────────────────────
 * `deriveShortName` means a missing short name is never a missing name. A
 * catalogue of three hundred imported products has none on the day it lands, and
 * a card that renders blank until a founder has been through all of them is
 * worse than one that renders a decent guess immediately. The stored field, and
 * the AI pass that fills it, are both improvements on this floor — never
 * prerequisites for it.
 */
import type { CatalogueProduct } from './types'

/**
 * The budget, in characters.
 *
 * Measured against the poster rather than chosen: the spec table's name column
 * sets around 24 characters before it wraps, and a wrapped row costs the card a
 * product. Cards and list rows are all wider than that, so the poster is the
 * binding constraint and there is no reason for a second number.
 *
 * Deliberately NOT also a word cap. An earlier draft capped at three words,
 * which cuts "Vitamin D3 + K2" — four tokens, fifteen characters, and exactly
 * what the product is called. Characters are what the layout actually runs out
 * of; words are a proxy that is wrong in both directions.
 */
export const SHORT_NAME_MAX = 24

/**
 * Words that describe the tier of a product rather than the product.
 *
 * Dropped only when the name is over budget, and from either end, because they
 * turn up at both: "100% Whey Protein **Professional**", "**Ultimate** Omega +
 * CoQ10". What is left is still a true name for the thing — which is the test a
 * word has to pass to be on this list. "Isolate", "Hydrolysed" and "Monohydrate"
 * are not here and must not be: they say which whey, which collagen, which
 * creatine, and a stack listing two products that both shorten to "Collagen" has
 * lost the reader more than a wrapped row would.
 */
const FILLER = new Set([
  'professional', 'premium', 'advanced', 'ultimate', 'ultra', 'super', 'strong',
  'elite', 'pro', 'max', 'formula', 'complex', 'blend', 'powder', 'sports',
  'nutrition', 'series', 'edition',
])

/**
 * Size, count and pack tokens — "250g", "90 vcaps", "60 tablets", "4kg".
 *
 * A unit or a count noun is REQUIRED, never both optional. Making them both
 * optional matches a bare trailing number, and the trailing number in "Super
 * Strong Omega 3" is the product, not the pack. Anything that is only a number
 * stays.
 */
const SIZE_TAIL = new RegExp(
  String.raw`[\s,–—-]*\b\d+(?:[.,]\d+)?\s*` +
    String.raw`(?:(?:g|kg|mg|ml|l|oz|lb)\b|` +
    String.raw`(?:x\s*)?(?:caps?|vcaps?|capsules?|tabs?|tablets?|softgels?|servings?|sachets?|bars?|pcs?|pack)\b)` +
    String.raw`\s*$`,
  'i',
)

/** A bare trailing unit with no number in front — "…Protein Powder g". */
const UNIT_TAIL = /[\s,–—-]*\b(?:g|kg|ml|l)\s*$/i

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Strip punctuation a name should never end or begin on.
 *
 * A trailing `+` is removed only when it is floating — "Vitamin D3 +", left
 * behind by a cut — and never when it is attached to the word before it.
 * "Hydration+" is what the product is called.
 */
const tidy = (s: string) =>
  collapse(s)
    .replace(/^[\s,;:&+/–—-]+/, '')
    .replace(/[\s,;:&/–—-]+$/, '')
    .replace(/\s+\+$/, '')

/**
 * A short name derived from the title alone — deterministic, offline, and
 * always non-empty.
 *
 * The steps are ordered by how confident each one is. Everything before the
 * truncation removes text that is provably not part of the name (the brand we
 * put there, a pack size, a marketing sub-clause). Only when that is not enough
 * does it start cutting words that might have mattered.
 */
export function deriveShortName(product: Pick<CatalogueProduct, 'title'>): string {
  let name = collapse(product.title ?? '')
  if (!name) return ''

  // 1. Our own brand. On a CHRGD card it spends five characters saying what the
  //    footer already says.
  name = name.replace(/^chrgd\s+/i, '')

  // 2. The sub-clause. This roster separates a product's name from its
  //    positioning with a SPACED dash — "ZMA - Sports Recovery - 90 vcaps",
  //    "Collagen Peptides - Joints & Bones - 153g" — and the first segment is
  //    always the name. The spacing is what makes this safe: "Kre-Alkalyn" and
  //    "Stim-Free" are hyphenated words, not clauses, and are left alone.
  name = name.split(/\s+[–—-]\s+/)[0]

  // 3. Parenthetical asides — "Kre-Alkalyn EFX (Clear Caps)".
  name = collapse(name.replace(/\s*\([^)]*\)/g, ''))

  // 4. Pack size, then a stray unit left behind by it.
  name = tidy(name.replace(SIZE_TAIL, '').replace(UNIT_TAIL, ''))

  // 5. A leading percentage claim — "100% Whey Protein" is Whey Protein.
  name = tidy(name.replace(/^\d+\s*%\s*/, ''))

  if (name.length <= SHORT_NAME_MAX) return name || collapse(product.title)

  // 6. Over budget. Drop tier words from the outside in, one at a time, and stop
  //    the moment it fits — so "100% Whey Protein Professional" loses only
  //    "Professional" and never reaches "Whey".
  let words = name.split(' ')
  const isFiller = (w: string) => FILLER.has(w.toLowerCase().replace(/[^a-z0-9]/gi, ''))
  while (words.length > 1 && name.length > SHORT_NAME_MAX) {
    if (isFiller(words[words.length - 1])) words = words.slice(0, -1)
    else if (isFiller(words[0])) words = words.slice(1)
    else break
    name = tidy(words.join(' '))
  }
  if (name.length <= SHORT_NAME_MAX) return name

  // 7. Still over. Keep whole words from the front — the identifying part of a
  //    supplement name is almost always its head — and never emit a fragment
  //    with no letters in it.
  const kept: string[] = []
  for (const word of words) {
    const next = kept.length ? `${kept.join(' ')} ${word}` : word
    if (next.length > SHORT_NAME_MAX) break
    kept.push(word)
  }
  const cut = tidy(kept.join(' '))
  // A single word longer than the budget (a chemical name, a brand run
  // together) has nowhere to break. Hard-cut it rather than return nothing.
  return cut || tidy(name.slice(0, SHORT_NAME_MAX))
}

/**
 * The short name to display — the stored one, or a derivation of the title.
 *
 * The only function the rest of the app should call. Callers never need to know
 * whether a founder has been through the catalogue yet.
 */
export function shortNameOf(product: Pick<CatalogueProduct, 'title' | 'shortName'>): string {
  const stored = product.shortName?.trim()
  return stored || deriveShortName(product)
}

/**
 * Whether a stored short name is actually doing its job.
 *
 * Used by the founders' scan to count what needs writing. A name that is over
 * budget, or is simply the title again, is not a short name — it is a field
 * somebody filled in.
 */
export function shortNameNeedsWork(product: Pick<CatalogueProduct, 'title' | 'shortName'>): boolean {
  const stored = product.shortName?.trim()
  if (!stored) return true
  return stored.length > SHORT_NAME_MAX || stored === collapse(product.title ?? '')
}
