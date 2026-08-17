import type { StackBlueprint } from '@/lib/stack-blueprint'
import { stackLevelOf } from '@/lib/stack-blueprint/pricing'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { StackIdentity } from '@/lib/types'
import { selectStatAxes, stackStatScore, MAX_STAT } from '@/lib/stack-stats'
import { focusAreaGlyph } from '@/lib/identity-visuals'
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
 *  tells you less than the seven-word truncation would. */
const MIN_CLAUSE_WORDS = 4

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
 * The engine addresses personalised reasons to the customer by name —
 * `For ${name}: ${reason}` (`stack-blueprint/factory.ts`). On the results screen
 * that is a nice touch. On a public card it is a name nobody asked to publish,
 * arriving through a field that looks like product copy.
 *
 * Stripped structurally so it holds even when the caller does not pass a name to
 * redact, and reinforced by `redact()` for the AI personalisation pass, which is
 * unreviewed model output and free to address someone however it likes.
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

/**
 * A slot reason, cut to something that fits a card row.
 *
 * The engine writes reasons as a claim plus a personalised clause — "Keeps you
 * hydrated and prevents cramps — especially useful in long or sweaty sessions."
 * The first clause is almost always the part worth showing, so an em-dash or
 * semicolon boundary is preferred over counting words. Falls back to a word cap
 * when there is no boundary, or when the boundary would leave a stub.
 *
 * This is a *layout* cut, not a compliance filter. Claim safety on the card is a
 * separate, blocking gate — see `docs/SHARE_CARD_BLUEPRINT.md` §6.1 — and it
 * belongs upstream of this function, because truncation can no more make a
 * banned claim safe than it can make a safe one banned.
 */
export function shortReason(reason: string, maxWords = 7, name: string | null = null): string {
  const cleaned = redact(reason.replace(ADDRESS_PREFIX, ''), name)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
  if (!cleaned) return ''

  // Prefer the first clause, when there is one and it says enough.
  const boundary = cleaned.search(/\s*[—–;:]\s*/)
  if (boundary > 0) {
    const clause = cleaned.slice(0, boundary).trim()
    const n = words(clause).length
    if (n >= MIN_CLAUSE_WORDS && n <= maxWords) return clause
  }

  const all = words(cleaned)
  if (all.length <= maxWords) return cleaned

  const cut = all.slice(0, maxWords)
  while (cut.length > MIN_CLAUSE_WORDS && DANGLING.has(cut[cut.length - 1].toLowerCase())) {
    cut.pop()
  }
  return cut.join(' ').replace(/[,;:—–]$/, '')
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
      product: product.title,
      reason: shortReason(slot.reason, 7, customerName),
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
    stackName: blueprint.stackName,
    archetype: identity?.archetype ?? '',
    focusAreas: (identity?.focusAreas ?? []).map((label) => ({ label, glyph: focusAreaGlyph(label) })),
    fitScore: identity ? clampScore(identity.routineFitScore) : null,
    lineup,
    coverage,
    level: stackLevelOf(blueprint),
    drinksMode,
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
