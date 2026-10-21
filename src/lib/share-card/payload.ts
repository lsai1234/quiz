import type { StackBlueprint } from '@/lib/stack-blueprint'
import { stackLevelOf } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import { selectStatAxes, stackStatScore, MAX_STAT } from '@/lib/stack-stats'
import { shortNameOf } from '@/lib/catalogue/short-name'
import { productTypeLabel } from '@/lib/catalogue/product-type'
import { pickArtKey } from './art'
import { SHARE_PAYLOAD_VERSION, type ShareCardPayload, type ShareLineupEntry } from './types'

/**
 * Turning a finished stack into the thing that gets posted.
 *
 * Everything here is a projection of data the quiz already produced — there is
 * no new content authored for the card and no second AI call. That is
 * deliberate: a card saying something the results screen does not would be a
 * second source of truth about someone's stack, and the two would drift.
 *
 * Nothing AI-written goes on the card. The name is the engine's rule-based
 * `stackName`, the same one the results page shows; there is no archetype,
 * focus areas or fit score (they came from the AI identity, which is no longer
 * called); and no slot reason, because a reason is either engine copy saying
 * what a product does or AI text, and both are claims we have not reviewed.
 *
 * The coverage bars are the clearest case. They use `selectStatAxes` and
 * `stackStatScore` — the same axes the product deck already compares cards on —
 * so the card cannot disagree with the screen it was shared from.
 */

/**
 * The serving line for a product — "30 G / DAY", "1 SCOOP".
 *
 * Built only from data the catalogue actually holds: the key active's milligrams
 * where there is one, and the pack's own serving description otherwise. Returns
 * undefined when neither exists, and the card leaves the column blank.
 *
 * Deliberately never inferred. A dose invented to fill a layout is a statement
 * about how much of a supplement somebody should take, printed on a public card
 * — which is the one kind of claim this feature must never make by accident.
 */
function servingLine(product: CatalogueProduct): string | undefined {
  const active = product.actives?.find((a) => typeof a.mg === 'number' && a.mg > 0)
  if (active?.mg) {
    return active.mg >= 1000
      ? `${Math.round(active.mg / 100) / 10} G / DAY`
      : `${active.mg} MG / DAY`
  }
  const size = product.variants?.[0]?.size
  return size ? String(size).toUpperCase() : undefined
}

/** How many coverage bars the card has room for. */
const COVERAGE_AXES = 4

/**
 * Words that cannot end a reason. Cutting "Boosts energy, focus and blood flow
 * before training" at seven words leaves "…blood flow before", which reads as a
 * transmission error rather than a label. Trailing function words are dropped
 * until the fragment ends on something carrying meaning.
 */
const DANGLING = new Set([
  'a', 'an', 'and', 'as', 'at', 'before', 'but', 'by', 'for', 'from', 'in',
  'into', 'of', 'on', 'or', 'over', 'so', 'than', 'that', 'the', 'to', 'until',
  'up', 'when', 'while', 'with', 'without',
])

/** Below this, a clause is too short to be worth cutting to — "Boosts energy"
 *  tells you less than the truncation would. */
const MIN_CLAUSE_WORDS = 4

/**
 * The row's word budget.
 *
 * Nine rather than the seven the plan assumed, decided by rendering it: the
 * engine's clauses land at eight and nine words far more often than at seven,
 * and cutting one word early takes the noun off the end — "recovery is your
 * biggest" instead of "recovery is your biggest performance lever". Nine still
 * sets on one line at the card's row width.
 */
const MAX_REASON_WORDS = 9

/**
 * Words, for the purpose of a word budget.
 *
 * Standalone punctuation does not count. A dash floating between two words is a
 * separator the writer used, not a word the reader spends attention on, and
 * counting it both shortens the row by one real word and can leave the cut
 * ending on a stray "—".
 */
const words = (s: string) =>
  s.trim().split(/\s+/).filter((w) => w && !/^[—–\-;:,.]+$/.test(w))

/**
 * The engine addresses personalised reasons to the customer, in two shapes:
 *
 *   "For Sam: Magnesium glycinate to help you wind down…"        (wellbeing)
 *   "Chosen for Sam — creatine is the most-studied supplement"   (performance)
 *
 * On the results screen both are a nice touch. On a public card the name is
 * something nobody opted into publishing, arriving through a field that reads as
 * product copy — and the address is not even the interesting half of the
 * sentence. What is worth showing is always what comes after it.
 *
 * So the address gets removed rather than truncated around: the `For X:` form
 * structurally, and the `Chosen for X —` form by dropping leading clauses that
 * are too short to be saying anything once the name has gone. `redact()` covers
 * the AI personalisation pass, which is unreviewed model output and free to
 * address someone however it likes.
 */
const ADDRESS_PREFIX = /^for\s+[^:]{1,40}:\s*/i

/** Remove a name wherever it appears, including the possessive form. */
function redact(text: string, name: string | null): string {
  const first = name?.trim().split(/\s+/)[0]
  if (!first || first.length < 2) return text
  const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text
    .replace(new RegExp(`\\b${escaped}(?:['’]s)?\\b[,:]?\\s*`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Sentence case, for a clause that used to sit mid-sentence. */
function capitalise(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

/**
 * A slot reason, cut to something that fits a card row.
 *
 * No longer used by `buildSharePayload`: new cards carry no reason (see the
 * header). Kept, with its tests, because it is part of the module's public
 * exports (`index.ts`).
 *
 * The engine writes a reason as an address plus a clause, or a claim plus a
 * personalising clause:
 *
 *   "Chosen for Sam — creatine is the most-studied strength supplement available"
 *   "Keeps you hydrated and prevents cramps — especially useful in long sessions"
 *
 * The two want opposite halves, and what separates them is not position but
 * substance: an address stops saying anything once the name is removed, and a
 * claim does not. So the string is split at its clause boundaries and the first
 * fragment with enough words left in it wins, whichever side it falls on.
 *
 * This is a *layout* cut, not a compliance filter. Claim safety on the card is a
 * separate, blocking gate — see `docs/SHARE_CARD_BLUEPRINT.md` §6.1 — and it
 * belongs upstream of this function, because truncation can no more make a
 * banned claim safe than it can make a safe one banned.
 */
export function shortReason(reason: string, maxWords = MAX_REASON_WORDS, name: string | null = null): string {
  const cleaned = redact(reason.replace(ADDRESS_PREFIX, ''), name)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
  if (!cleaned) return ''

  const segments = cleaned
    .split(/\s*[—–;:]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)

  // The last segment rather than the first, when every fragment is short: a
  // trailing stub is at least the end of the thought, where a leading one is
  // usually the salutation that is being dropped in the first place.
  const chosen = segments.find((s) => words(s).length >= MIN_CLAUSE_WORDS)

  // Nothing substantive survived — the whole string was an address. Better to
  // say nothing and let the caller fall back than to print "Chosen for".
  if (!chosen) return ''

  const all = words(chosen)
  if (all.length <= maxWords) return capitalise(chosen)

  const cut = all.slice(0, maxWords)
  while (cut.length > MIN_CLAUSE_WORDS && DANGLING.has(cut[cut.length - 1].toLowerCase())) {
    cut.pop()
  }
  return capitalise(cut.join(' ').replace(/[,;:—–]$/, ''))
}

export interface BuildSharePayloadOptions {
  /**
   * The customer's name. Only its first word is ever used, and only when
   * `showFirstName` says so.
   *
   * It used to be passed so it could be stripped from slot reasons, which the
   * engine addresses to the customer ("For Sam: ..."). Cards no longer carry a
   * reason, so nothing else here reads it.
   *
   * The name is passed in rather than read from `QuizAnswers` because this
   * builder never opens the answers object at all — that object is where the
   * safety-screen disclosures live, and the cheapest way to guarantee they never
   * reach a public asset is for the code writing that asset to have no access
   * to them.
   */
  customerName?: string | null
  /**
   * Put the first name on the card. Off by default: the card is a public URL,
   * and a name on it is the difference between a vanity graphic and a small
   * piece of personal data with no expiry.
   */
  showFirstName?: boolean
  /** Partner or competition entry code. */
  code?: string | null
  /** Injectable for deterministic tests. */
  now?: () => Date
}

/**
 * Build the snapshot: `buildSharePayload(blueprint, products, options)`.
 *
 * The older form, with an AI identity between the blueprint and the products,
 * still compiles so existing callers keep working, but the identity is not
 * read: the card's name is always the blueprint's.
 */
export function buildSharePayload(
  blueprint: StackBlueprint,
  products: CatalogueProduct[],
  options?: BuildSharePayloadOptions,
): ShareCardPayload
/** @deprecated The identity is ignored. Use `buildSharePayload(blueprint, products, options)`. */
export function buildSharePayload(
  blueprint: StackBlueprint,
  identity: unknown,
  products: CatalogueProduct[],
  options?: BuildSharePayloadOptions,
): ShareCardPayload
export function buildSharePayload(
  blueprint: StackBlueprint,
  second: CatalogueProduct[] | unknown,
  third?: CatalogueProduct[] | BuildSharePayloadOptions,
  fourth?: BuildSharePayloadOptions,
): ShareCardPayload {
  const legacy = !Array.isArray(second)
  const products = (legacy ? third : second) as CatalogueProduct[]
  const options = ((legacy ? fourth : third) ?? {}) as BuildSharePayloadOptions
  const {
    customerName = null,
    showFirstName = false,
    code = null,
    now = () => new Date(),
  } = options

  const selected = blueprint.slots
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((slot) => ({ slot, product: products.find((p) => p.id === slot.selectedProductId) }))

  const lineup: ShareLineupEntry[] = selected
    // A slot whose product has left the catalogue is dropped rather than
    // rendered as a blank row: the card is a boast, and a boast with a hole in
    // it is worse than a shorter one.
    .filter((e): e is { slot: (typeof e)['slot']; product: CatalogueProduct } => !!e.product)
    .map(({ product }) => ({
      // The product type ("Vitamin C"), not the slot title ("Immune Support"):
      // a goal printed beside a product is a health claim, and this one is on
      // a public card. Same field name, so the payload shape is unchanged.
      slot: productTypeLabel(product),
      // The spec table is a fixed-width column, and a wrapped row costs the
      // card a product. This used to strip a literal "CHRGD " prefix, which
      // worked only because every mock product carries one — a real supplier
      // title ("Collagen Peptides - Joints & Bones - 153g") ran off the edge.
      // `shortNameOf` is the founder-written name where there is one and a
      // derivation of the title where there is not, so the card never has to
      // wait for the catalogue to be curated.
      product: shortNameOf(product),
      // Always empty. The field stays because stored cards and the decoder
      // carry it; no format prints it.
      reason: '',
      ...(servingLine(product) ? { dose: servingLine(product) } : {}),
    }))

  const inStack = selected.map((e) => e.product).filter((p): p is CatalogueProduct => !!p)

  const coverage = selectStatAxes(blueprint, products, COVERAGE_AXES).map((axis) => ({
    label: axis.label,
    // Stored 0–100 so the renderer draws a meter and does no arithmetic of its
    // own. A renderer that rescales is one that can rescale differently per
    // format — and then two cards from the same stack disagree.
    score: Math.round((stackStatScore(inStack, axis.goal) / MAX_STAT) * 100),
    targeted: inStack.some((p) => p.goals.includes(axis.goal)),
  }))

  const name = showFirstName ? customerName?.trim().split(/\s+/)[0] : undefined

  return {
    v: SHARE_PAYLOAD_VERSION,
    // The engine's name, the one the results page shows. One name for one stack.
    stackName: blueprint.stackName,
    // The three identity fields stay in the shape for stored cards and the
    // decoder, and are always empty on a card built now.
    archetype: '',
    focusAreas: [],
    fitScore: null,
    lineup,
    coverage,
    level: stackLevelOf(blueprint),
    artKey: pickArtKey([blueprint.primaryGoal, ...blueprint.secondaryGoals]),
    ...(inStack[0]?.imageUrl ? { heroImage: inStack[0].imageUrl } : {}),
    ...(name ? { firstName: name } : {}),
    ...(code ? { code: code.trim().toUpperCase() } : {}),
    createdAt: now().toISOString(),
  }
}
