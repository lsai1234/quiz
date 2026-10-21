/**
 * "Built from your answers" and "What we checked": the results page's account
 * of why each product is in the stack, and what the engine did for this
 * person. Pure and client-safe. Every sentence comes from phrases.ts.
 *
 * ── Built from your answers ─────────────────────────────────────────────────
 * One line per product, from the score terms that moved it most. Only two
 * kinds of term may be said:
 * - a goal the person chose, where the goal-to-claim map backs it for this
 *   product's kind. The line is "You said ..." and the claim that backs it is
 *   shown beside it, verbatim;
 * - an answer that is not about health (training, diet).
 * Everything else is passed over: product properties (priority, Top 25 rank),
 * wellbeing follow-ups, lifestyle, v2 drivers, age, gender, and anything from
 * the safety screen. A goal the map does not back is passed over too, and the
 * walk carries on to the next term. When nothing qualifies there is no line.
 *
 * An answer line next to a product with no authorised claim would still say
 * the product is for that answer ("You play football" beside a pre-workout),
 * so by default those products get no line (`ANSWER_LINE_NEEDS_CLAIM`).
 *
 * ── What we checked ─────────────────────────────────────────────────────────
 * Read from `blueprint.checks`, kept to what is still true of the slots on
 * screen (`checksForSlots`). Safety exclusions are never said. Goal gates
 * apply to everyone and the relevance floor is internal, so neither is said.
 */

import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { Goal, QuizAnswers } from '@/lib/types'
import { claimsFor, type Claim } from '@/lib/consult/claims'
import { withDeepDiveSignals } from '@/lib/ai-questions'
import { checksForSlots, getArchetype, scoreProductDetailed, type SlotType } from '@/lib/stack-blueprint/factory'
import type { Contribution, StackCheck, StackCheckKind } from '@/lib/stack-blueprint/explain-types'
import type { StackBlueprint, StackSlotEntry } from '@/lib/stack-blueprint/types'
import { goalClaimFor, productClaim } from './goal-claims'
import { ANSWER_LINES, CHECK_LINES, GOAL_LINES, activeDisplayName, type AnswerField } from './phrases'

export type ProductExplanation =
  | { kind: 'goal'; goal: Goal; sentence: string; claim: Claim }
  | { kind: 'answer'; field: AnswerField; value: string; sentence: string; claim: Claim | null }

/**
 * When true, a product whose kind carries no authorised claim gets no line at
 * all. Set to false to let answer lines (training, diet) appear beside those
 * products too; see the header for why the default is true.
 */
export const ANSWER_LINE_NEEDS_CLAIM = true

/** The answer fields a line may come from. Goals go through the map instead. */
const ANSWER_FIELDS = new Set<string>(Object.keys(ANSWER_LINES))

function isAnswerField(field: Contribution['field']): field is AnswerField {
  return ANSWER_FIELDS.has(field)
}

/** Positive terms, largest first; equal points keep the engine's order. */
function rankedTerms(contributions: readonly Contribution[]): Contribution[] {
  return contributions
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.points > 0)
    .sort((a, b) => b.c.points - a.c.points || a.i - b.i)
    .map(({ c }) => c)
}

/**
 * The "Built from your answers" line for one product, or null when there is
 * nothing it may honestly say.
 *
 * `slotType` is the slot the engine scored it for: `slot.slotType` for a
 * product in a slot, `product.stackSlots[0]` for one added on its own.
 */
export function explainProduct(input: {
  product: CatalogueProduct
  slotType: SlotType
  answers: QuizAnswers
}): ProductExplanation | null {
  const { product, slotType } = input
  // The same answers the engine scored with: deep-dive signals folded in.
  const answers = withDeepDiveSignals(input.answers)
  const hasClaim = claimsFor(product.swapGroup).length > 0
  if (!hasClaim && ANSWER_LINE_NEEDS_CLAIM) return null

  const detail = scoreProductDetailed(product, slotType, answers, getArchetype(answers.goals))
  if (detail.excludedBy) return null

  for (const term of rankedTerms(detail.contributions)) {
    if (term.field === 'goals') {
      const goal = term.value
      if (typeof goal !== 'string' || !answers.goals.includes(goal as Goal)) continue
      const sentence = GOAL_LINES[goal as Goal]
      const claim = goalClaimFor(goal as Goal, product)
      if (sentence && claim) return { kind: 'goal', goal: goal as Goal, sentence, claim }
      continue
    }
    if (isAnswerField(term.field) && typeof term.value === 'string') {
      const sentence = (ANSWER_LINES[term.field] as Record<string, string>)[term.value]
      if (!sentence) continue
      return {
        kind: 'answer',
        field: term.field,
        value: term.value,
        sentence,
        claim: productClaim(product, answers.goals),
      }
    }
  }
  return null
}

/** `explainProduct` for a slot, looking its product up in the catalogue. */
export function explainSlot(input: {
  slot: Pick<StackSlotEntry, 'selectedProductId' | 'slotType'>
  catalogue: readonly CatalogueProduct[]
  answers: QuizAnswers
}): ProductExplanation | null {
  const product = input.catalogue.find((p) => p.id === input.slot.selectedProductId)
  if (!product) return null
  return explainProduct({ product, slotType: input.slot.slotType as SlotType, answers: input.answers })
}

/** The most "What we checked" lines shown. */
export const MAX_CHECK_LINES = 5

/** Things they told us first, then the stack-wide rules. */
const CHECK_ORDER: readonly StackCheckKind[] = [
  'already-taking', 'collagen-veggie', 'vegan', 'gluten-free', 'stimulant', 'dedup-active', 'dose-cap',
]

function checkLine(check: StackCheck): string | null {
  switch (check.kind) {
    case 'already-taking':
      return typeof check.value === 'string' ? CHECK_LINES.alreadyTaking[check.value] ?? null : null
    case 'stimulant':
      return check.field ? CHECK_LINES.stimulant[check.field] ?? null : null
    case 'vegan':
      return CHECK_LINES.vegan
    case 'gluten-free':
      return CHECK_LINES.glutenFree
    case 'collagen-veggie':
      return CHECK_LINES.collagenVeggie
    case 'dose-cap': {
      const name = check.active ? activeDisplayName(check.active) : null
      return name && check.capMg != null ? CHECK_LINES.doseCap(name, check.capMg) : null
    }
    // 'dedup-active' is one line for all of them, built in whatWeChecked.
    // Never said: 'safety' (special-category answers), 'goal-gate' (the same
    // for everyone) and 'relevance-floor' (internal tidying).
    default:
      return null
  }
}

/** Every doubled-up active as one line, or null when there were none. */
function dedupLine(checks: readonly StackCheck[]): string | null {
  const dedup = checks.filter((c) => c.kind === 'dedup-active')
  if (dedup.length === 0) return null
  const names = [...new Set(dedup.map((c) => (c.active ? activeDisplayName(c.active) : null)).filter((n): n is string => n != null))]
  return names.length > 0 ? CHECK_LINES.dedupActive(names) : CHECK_LINES.dedupActiveUnnamed
}

/**
 * The "What we checked" list: only things that happened for this person and
 * are still true of the slots shown, at most `MAX_CHECK_LINES`, one line per
 * distinct thing. [] when nothing happened, or the blueprint carries no checks
 * (mock and consult blueprints).
 *
 * `products` is the catalogue. `slots` defaults to the blueprint's; pass the
 * depth on screen when it is a subset.
 */
export function whatWeChecked(input: {
  blueprint: Pick<StackBlueprint, 'checks' | 'slots'>
  products: readonly CatalogueProduct[]
  slots?: readonly StackSlotEntry[]
}): string[] {
  const checks = checksForSlots(input.blueprint.checks, input.slots ?? input.blueprint.slots, input.products)
  const lines: Array<{ order: number; seq: number; text: string }> = []
  const seen = new Set<string>()
  checks.forEach((check, seq) => {
    const order = CHECK_ORDER.indexOf(check.kind)
    if (order === -1) return
    const text = check.kind === 'dedup-active' ? dedupLine(checks) : checkLine(check)
    if (!text || seen.has(text)) return
    seen.add(text)
    lines.push({ order, seq, text })
  })
  return lines
    .sort((a, b) => a.order - b.order || a.seq - b.seq)
    .slice(0, MAX_CHECK_LINES)
    .map((l) => l.text)
}
