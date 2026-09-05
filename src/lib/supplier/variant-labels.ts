/**
 * Turning a set of sibling SKU names into flavour labels.
 *
 * ── The problem this solves ─────────────────────────────────────────────────
 * A PowerBody product with six flavours is six separate products at their end,
 * each with its own SKU, its own stock and its own full name:
 *
 *   Endurance Breathe Isotonic Energy Gel, Blackcurrant - 20 x 60g
 *   Endurance Breathe Isotonic Energy Gel, Orange - 20 x 60g
 *   Endurance Breathe Isotonic Energy Gel, Lemon - 20 x 60g
 *
 * We merge those into ONE product with six variants, and the variant picker
 * needs a short label for each. Showing the full supplier name six times is
 * unreadable — the words that differ are two per cent of the string.
 *
 * ── Why the difference is computed rather than parsed ───────────────────────
 * The obvious approach is a parser: take what is after the comma, or before
 * the dash. Every version of that breaks on the next brand, because there is
 * no format — some put the flavour last, some in the middle, some use a dash
 * where others use a comma, and plenty use both for other purposes.
 *
 * So nothing is parsed. The siblings are compared against EACH OTHER: strip
 * the longest run of words they all start with, strip the longest run they all
 * end with, and what is left is by definition the part that distinguishes
 * them. It needs no knowledge of anybody's naming convention and works the
 * same on flavours, sizes and pack counts.
 *
 * ── Why it backs off to word boundaries ─────────────────────────────────────
 * A character-wise common prefix over "Blackcurrant" and "Blackberry" is
 * "Black", which would label them "currant" and "berry". The prefix and suffix
 * are therefore taken in whole words, so the shortest sensible answer is a
 * whole word.
 *
 * Pure: no network, no database, no DOM.
 */

/** Splits on whitespace but keeps punctuation attached, so ", Orange" stays one token. */
function words(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean)
}

/** Trim the separators a stripped label is commonly left dangling. */
function tidy(s: string): string {
  return s.replace(/^[\s,\-–—:|/]+/, '').replace(/[\s,\-–—:|/]+$/, '').trim()
}

export interface VariantNameInput {
  sku: string
  /** The supplier's own full name for this exact SKU, when we have it. */
  name?: string | null
}

export interface VariantLabel {
  sku: string
  /** What to show in the picker. Never empty. */
  label: string
  /**
   * Whether the label came from a real supplier name.
   *
   * False means we fell back to the SKU code, which is the symptom the founder
   * sees as "P45757" sitting in a flavour list. The Hub uses this to say which
   * products still need a lookup rather than making somebody spot them.
   */
  named: boolean
}

/**
 * A short label for each sibling SKU.
 *
 * Every input gets an entry, in order. A SKU with no name falls back to its own
 * code — the honest placeholder, and the thing the repair pass looks for.
 */
export function variantLabels(inputs: VariantNameInput[]): VariantLabel[] {
  const named = inputs.filter((i) => (i.name ?? '').trim().length > 0)

  // Nothing to compare against: one named sibling keeps its whole name, and an
  // unnamed one has only its code.
  if (named.length < 2) {
    return inputs.map((i) => {
      const name = (i.name ?? '').trim()
      return { sku: i.sku, label: name || i.sku, named: name.length > 0 }
    })
  }

  const tokenised = named.map((i) => words((i.name ?? '').trim()))

  // How many leading words every sibling shares.
  let prefix = 0
  const shortest = Math.min(...tokenised.map((t) => t.length))
  while (prefix < shortest && tokenised.every((t) => t[prefix] === tokenised[0][prefix])) prefix++

  // ...and how many trailing words, without eating into the prefix.
  let suffix = 0
  while (
    suffix < shortest - prefix &&
    tokenised.every((t) => t[t.length - 1 - suffix] === tokenised[0][tokenised[0].length - 1 - suffix])
  ) {
    suffix++
  }

  const byName = new Map<string, string>()
  named.forEach((input, i) => {
    const t = tokenised[i]
    const middle = tidy(t.slice(prefix, t.length - suffix).join(' '))
    /*
      Two siblings can carry the SAME name — PowerBody list the same product
      twice under different codes often enough that it matters. Stripping the
      common part then leaves nothing, and a blank label is worse than a long
      one, so those keep their full name and stay distinguishable by stock.
    */
    byName.set(input.sku, middle || tidy((input.name ?? '').trim()))
  })

  return inputs.map((i) => {
    const label = byName.get(i.sku)
    return label
      ? { sku: i.sku, label, named: true }
      : { sku: i.sku, label: i.sku, named: false }
  })
}

/**
 * Does this variant title look like a raw SKU code rather than a flavour?
 *
 * The signature of the bug being repaired: import only ever fetched the detail
 * for a row's MAIN SKU, so every other flavour was labelled with its own code —
 * "P45757" in a list where the first entry was a real product name.
 *
 * Deliberately narrow. A supplier code here is a letter or two and then digits,
 * and it must be the whole title; a real flavour that happens to contain a
 * number ("2:1:1 Blue Razz") has to survive this untouched, because a false
 * positive means a repair pass overwrites a label somebody chose by hand.
 */
export function looksLikeSku(title: string | null | undefined): boolean {
  if (!title) return false
  return /^[A-Z]{0,3}\d{3,}[A-Z]?$/i.test(title.trim())
}
