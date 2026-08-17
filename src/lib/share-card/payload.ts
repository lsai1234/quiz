import type { StackBlueprint } from '@/lib/stack-blueprint'
import { stackLevelOf } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { StackIdentity } from '@/lib/types'
import { selectStatAxes, stackStatScore, MAX_STAT } from '@/lib/stack-stats'
import { focusAreaGlyph } from '@/lib/identity-visuals'
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
 * The coverage bars are the clearest case. They use `selectStatAxes` and
 * `stackStatScore` — the same axes the product deck already compares cards on —
 * so the card cannot disagree with the screen it was shared from.
 */

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
   * The customer's name — passed so it can be kept OFF the card, not put on it.
   *
   * The engine writes reasons addressed to the customer ("For Sam: Magnesium
   * glycinate to help you wind down…"), so a name reaches the card through a
   * field that looks like product copy whether or not anyone opted in. Giving
   * the builder the name is what lets it strip that; `showFirstName` is the
   * separate, explicit decision to display one.
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
  /** CHRGD LQD — the all-drinks package, which reframes the card's eyebrow. */
  drinksMode?: boolean
  /** Injectable for deterministic tests. */
  now?: () => Date
}

/**
 * Build the snapshot.
 *
 * `identity` is nullable on purpose. It comes from an AI call that can fail, be
 * unconfigured (no `OPENAI_API_KEY`), or simply not have run yet — and a share
 * button that only works when OpenAI is reachable is a share button that is
 * broken for some fraction of every day. Without an identity the card loses its
 * archetype, focus chips and fit meter and keeps its name, lineup and coverage,
 * which is still the card.
 */
export function buildSharePayload(
  blueprint: StackBlueprint,
  identity: StackIdentity | null,
  products: CatalogueProduct[],
  options: BuildSharePayloadOptions = {},
): ShareCardPayload {
  const {
    customerName = null,
    showFirstName = false,
    code = null,
    drinksMode = false,
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
    .map(({ slot, product }) => ({
      slot: slot.title,
      // "CHRGD Whey Protein" on a CHRGD card spends five characters saying what
      // the footer already says, and it is what pushed half the list onto a
      // second line. The brand is the card; the product is the name.
      product: product.title.replace(/^CHRGD\s+/i, ''),
      // The engine's reason, unless removing the address leaves nothing behind
      // — "Chosen for Sam" with no clause after it reduces to "Chosen for",
      // which renders as a row with a broken sentence under it. The catalogue's
      // own copy is the fallback: deterministic, already claim-reviewed, and
      // always about this product.
      reason:
        shortReason(slot.reason, MAX_REASON_WORDS, customerName) ||
        shortReason(product.shortReason || product.description, MAX_REASON_WORDS, customerName),
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
    // The AI identity's name ("Iron Foundations") over the engine's
    // ("Everyday Wellbeing Stack"). The engine's name is a category and the
    // identity's is a title, and the headline is the whole job of this card —
    // it is the line that gets screenshotted. Falls back to the engine's when
    // no identity was generated, which is the only name there is then.
    stackName: identity?.name?.trim() || blueprint.stackName,
    archetype: identity?.archetype ?? '',
    focusAreas: (identity?.focusAreas ?? []).map((label) => ({ label, glyph: focusAreaGlyph(label) })),
    fitScore: identity ? clampScore(identity.routineFitScore) : null,
    lineup,
    coverage,
    level: stackLevelOf(blueprint),
    drinksMode,
    artKey: pickArtKey([blueprint.primaryGoal, ...blueprint.secondaryGoals], drinksMode),
    ...(inStack[0]?.imageUrl ? { heroImage: inStack[0].imageUrl } : {}),
    ...(name ? { firstName: name } : {}),
    ...(code ? { code: code.trim().toUpperCase() } : {}),
    createdAt: now().toISOString(),
  }
}

/** 0–100, because a fit meter drawn from an out-of-range number is a bar that
 *  overflows its track and nothing else tells you it happened. */
function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score)))
}
