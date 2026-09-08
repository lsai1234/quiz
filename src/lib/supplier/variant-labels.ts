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
  /**
   * The supplier's own flavour field, when they filled it in.
   *
   * Used in preference to anything derived, because it is the answer rather
   * than an inference from one. It is blank on more than half of PowerBody's
   * rows — including rows whose name plainly carries a flavour — so it cannot
   * be the only source, but where it IS set it beats diffing every time.
   *
   * The difference is not cosmetic. A product merged from two of a brand's
   * lines ("Endurance Breathe" and "Endurance Energy") has almost nothing in
   * common between its siblings' names, so the diff keeps nearly the whole
   * string and the picker fills with sixty-character labels. The flavour field
   * says "Cola" and is done.
   */
  flavour?: string | null
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
  /*
    A supplied flavour short-circuits everything: it is already the shortest
    true label for that SKU. Only the rest are diffed against each other, and
    they are diffed among THEMSELVES — mixing a "Cola" into the comparison set
    would drag the common prefix to nothing and lengthen every other label.
  */
  const given = new Map<string, string>()
  for (const i of inputs) {
    const f = (i.flavour ?? '').trim()
    if (f) given.set(i.sku, f)
  }

  const rest = inputs.filter((i) => !given.has(i.sku))
  const derived = rest.length > 0 ? deriveLabels(rest) : []
  const byDerived = new Map(derived.map((d) => [d.sku, d]))

  return inputs.map((i) => {
    const f = given.get(i.sku)
    if (f) return { sku: i.sku, label: f, named: true }
    return byDerived.get(i.sku) ?? { sku: i.sku, label: i.sku, named: false }
  })
}

/** The diff, for the SKUs the supplier gave no flavour for. */
function deriveLabels(inputs: VariantNameInput[]): VariantLabel[] {
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

/**
 * What a set of sibling names have in common — the PRODUCT's name.
 *
 * ── The other half of the diff ──────────────────────────────────────────────
 * `variantLabels` keeps what differs between siblings, because that is the
 * flavour. This keeps what they SHARE, because that is the product, and until
 * now nothing did: an import took the row's MAIN sku's name for the whole
 * product, and a main sku is one flavour of it. So the shop shelf carried
 *
 *   Hydration+, Blue Raspberry - 240 grams
 *     ├ Hydration+                              ← the product's name, on a variant
 *     ├ Hydration+, Lemon & Lime - 240 grams
 *     └ Hydration+, Tropical Vibes - 240 grams
 *
 * — a product named after one of its flavours, with four flavours under it. The
 * two ends were swapped, and both come out of the same comparison: "Hydration+"
 * is what they all start with, and everything after it is what tells them apart.
 *
 * Whole words only, for the reason the module header gives: a character-wise
 * prefix over "Blackcurrant" and "Blackberry" is "Black".
 *
 * Null when there is nothing worth calling a name — fewer than two names to
 * compare, no shared opening, or a shared opening too short to be one ("The").
 *
 * The inputs are the sibling names of ONE product, so they share its name by
 * construction; the length bar is a backstop for the case where they do not,
 * and a product genuinely called "Gel" simply keeps the title it already has.
 */
export function commonProductName(names: string[]): string | null {
  const usable = names.map((n) => (n ?? '').trim()).filter((n) => n.length > 0)
  if (usable.length < 2) return null

  /*
    Words compared with their trailing punctuation ignored.

    "Hydration+" and "Hydration+, Lemon & Lime" are the same product, and an
    exact token compare says they share nothing at all — the comma is the only
    difference in the first word. That case is not hypothetical: it is what a
    half-repaired product looks like, where one variant has been relabelled and
    the rest still carry their full supplier names.
  */
  const tokenised = usable.map((n) => words(n))
  const same = (a: string, b: string) => tidy(a).toLowerCase() === tidy(b).toLowerCase()
  let prefix = 0
  const shortest = Math.min(...tokenised.map((t) => t.length))
  while (prefix < shortest && tokenised.every((t) => same(t[prefix], tokenised[0][prefix]))) {
    prefix++
  }
  if (prefix === 0) return null

  const common = tidy(tokenised[0].slice(0, prefix).join(' '))
  // Four characters, which is where a name starts and an article stops: "The"
  // and "2" are two names that happen to open the same way, not a product two
  // things are versions of.
  return common.length >= 4 ? common : null
}

/**
 * A better title for a product whose name is really one of its flavours, or
 * null to leave it exactly as it is.
 *
 * Deliberately narrow, because a title is the most visible field there is and a
 * repair pass that rewrites one somebody chose is worse than the bug. It only
 * acts when the current title IS one of the sibling names in full — the
 * signature of "the main sku's name became the product's" — and only when the
 * siblings share something shorter to be called.
 */
export function titleFromSiblings(current: string, names: string[]): string | null {
  const common = commonProductName(names)
  if (!common) return null

  const now = (current ?? '').trim()
  if (now === '' || now === common) return null
  // A hand-written title is not one of the supplier's names, so this leaves it
  // alone — the one case where doing nothing is certainly right.
  if (!names.some((n) => (n ?? '').trim().toLowerCase() === now.toLowerCase())) return null
  return common
}

/**
 * Take an opening off the front of a name, and a size off the end.
 *
 * The shared half of the two corrections below. Case-insensitive, because
 * PowerBody's own capitalisation varies between a product and its flavours, and
 * word-boundaried, because "Vegan" must not be lifted off "Vegan Protein" as
 * though the rest were a flavour called "Protein".
 *
 * Null when the opening is not there, or when taking it off would leave nothing
 * — a row cannot be relabelled with an empty string.
 */
function splitOff(text: string, opening: string, size?: string | null): string | null {
  const t = (text ?? '').trim()
  const open = (opening ?? '').trim()
  if (!open || open.length >= t.length) return null
  if (t.slice(0, open.length).toLowerCase() !== open.toLowerCase()) return null
  // The next character has to end a word: otherwise "Whey" comes off
  // "Wheyless" and the label becomes "less".
  if (/[\p{L}\p{N}]/u.test(t[open.length])) return null

  let rest = tidy(t.slice(open.length))
  /*
    …and the size off the end, when the variant knows its own.

    "Banana - 500 grams" and "500 grams" are the same fact printed twice: the
    picker already prints the size beside the label. What is left is the flavour
    and only the flavour, which is the whole point of a flavour label.
  */
  const sz = (size ?? '').trim()
  if (sz && rest.length > sz.length && rest.slice(-sz.length).toLowerCase() === sz.toLowerCase()) {
    rest = tidy(rest.slice(0, -sz.length))
  }
  return rest || null
}

/**
 * Undo the swap: this ROW is the product, and the product is wearing this row's
 * flavour.
 *
 * ── What it fixes ───────────────────────────────────────────────────────────
 * The damage import leaves when it takes a row's MAIN sku's name for the whole
 * product, and both ends end up on the wrong one:
 *
 *   Vegan Protein, Banana - 500 grams          ← the product, named after a flavour
 *     ├ Vegan Protein                          ← the product's name, on a row
 *     ├ Vegan Protein, Chocolate-Cinnamon …
 *     └ Protein, Forest Fruit - 500 grams
 *
 * Copying the row's label up to the title is only half of it, and the half that
 * still looks wrong in the shop: the product and one of its flavours are then
 * both called "Vegan Protein", and the picker offers a flavour by the product's
 * name. The other half is what the title was carrying that the row was not —
 * "Banana" — which belongs on the row.
 *
 * ── Why it needs no supplier call and no siblings ───────────────────────────
 * `titleFromSiblings` works out the product's name from what every sibling
 * shares, which is right when the labels are consistent and finds nothing when
 * they are not — and a half-repaired product is exactly where they are not
 * ("Vegan Protein, …" beside "Protein, …" share no opening word at all). This
 * needs only the two strings on screen: the product's title starts with this
 * row's label, so the row is wearing the product's name and the title is
 * carrying this row's flavour. Both are provable from the pair.
 *
 * Null when the title does not open with this label, which is the ordinary
 * case and means there is nothing to swap.
 */
export function nameSwap(
  title: string,
  label: string,
  size?: string | null,
): { title: string; label: string } | null {
  const flavour = splitOff(title, label, size)
  if (!flavour) return null
  return { title: (label ?? '').trim(), label: flavour }
}

/**
 * A flavour label with the product's name taken off the front.
 *
 * "Vegan Protein, Chocolate-Cinnamon - 500 grams" under a product called "Vegan
 * Protein" is the product's name printed twice and a flavour once. Returns the
 * label unchanged when it does not start with the product's name, so a row that
 * was named some other way is left exactly as it is.
 */
export function withoutProductName(label: string, title: string, size?: string | null): string {
  return splitOff(label, title, size) ?? (label ?? '').trim()
}
