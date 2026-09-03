import type { CatalogueProduct, DietaryTag, StackSlot } from '@/lib/catalogue/types'
import { STACK_SLOTS, SLOT_LABELS } from '@/lib/catalogue/types'
import type { Goal } from '@/lib/types'
import { ALL_GOALS } from '@/lib/types'
import { GOAL_LABELS } from '@/lib/quiz-goals'
import { DIETARY_LABEL } from '@/lib/product-facts'

/**
 * The fallback parse, for sentences the synonym table cannot read.
 *
 * `synonyms.ts` handles what people actually type most of the time, instantly
 * and for free. This is for the rest — "something for cramp on long runs that
 * isn't a powder" — and it only ever runs when the local search found NOTHING,
 * because a query that already works must never be made slower or less
 * predictable by a network round trip.
 *
 * ── The model is a suggestion engine, never a source of truth ────────────────
 * Everything it returns is validated against what the catalogue actually
 * contains before any of it reaches a query: a dietary tag we do not have, a
 * slot that is not in `STACK_SLOTS`, a category nobody stocks, a negative price
 * — all dropped. The worst a bad completion can do is produce an empty patch.
 *
 * And whatever survives is applied as ORDINARY filters, so it lands as the same
 * removable chips a person would get from tapping. A guess the shopper cannot
 * see and undo is the thing this feature exists not to be.
 */

export interface IntentPatch {
  dietary: DietaryTag[]
  goals: Goal[]
  slots: StackSlot[]
  categories: string[]
  priceMax: number | null
  priceMin: number | null
  stimFree: boolean
  /** What is left to search for as text, once the filters have been lifted out. */
  text: string
}

export const EMPTY_PATCH: IntentPatch = {
  dietary: [], goals: [], slots: [], categories: [],
  priceMax: null, priceMin: null, stimFree: false, text: '',
}

/** True when the patch would change nothing — the caller then leaves the query alone. */
export function isEmptyPatch(patch: IntentPatch): boolean {
  return (
    patch.dietary.length === 0 && patch.goals.length === 0 && patch.slots.length === 0 &&
    patch.categories.length === 0 && patch.priceMax === null && patch.priceMin === null &&
    !patch.stimFree && patch.text.trim() === ''
  )
}

export const SHOP_INTENT_SYSTEM_PROMPT = `You translate a supplement shopper's sentence into shop filters.

Reply with JSON only, using exactly these keys:
{"dietary":[],"goals":[],"slots":[],"categories":[],"priceMax":null,"priceMin":null,"stimFree":false,"text":""}

Rules:
- Use ONLY values from the lists you are given. Never invent one.
- "text" is what is left to match against product NAMES once the filters are lifted out. Leave it empty if the sentence names no product.
- priceMax/priceMin are numbers in pounds, or null. Only set one if the shopper was explicit about a limit.
- stimFree is true only if they asked to avoid caffeine or stimulants.
- Prefer fewer filters. An empty result is better than a wrong one.
- Never diagnose, never give health advice, never present a product as medical care for a condition. You are sorting a shelf.`

/*
 * The wording avoids "treats" on purpose. `claim-safety.ts` lints authored copy
 * for exactly that word, and a prompt is authored copy — the fact that this one
 * uses it to FORBID a claim is not something a regexp can tell. Saying the same
 * thing in words the lint can pass keeps the guard meaningful everywhere.
 */

/** The prompt body: the shopper's words, and the vocabulary they may be mapped to. */
export function buildIntentPrompt(query: string, products: CatalogueProduct[]): string {
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))]
  const dietary = Object.entries(DIETARY_LABEL).map(([id, label]) => `${id} (${label})`)
  const goals = ALL_GOALS.map((g) => `${g} (${GOAL_LABELS[g] ?? g})`)
  const slots = STACK_SLOTS.map((s) => `${s} (${SLOT_LABELS[s]})`)

  return [
    `Shopper said: "${query.slice(0, 200)}"`,
    '',
    `dietary options: ${dietary.join(', ')}`,
    `goals options: ${goals.join(', ')}`,
    `slots options: ${slots.join(', ')}`,
    `categories options: ${categories.join(', ')}`,
  ].join('\n')
}

// ─── Validation ────────────────────────────────────────────────────────────────

const DIETARY_TAGS = Object.keys(DIETARY_LABEL) as DietaryTag[]

/** Anything not in `allowed` is dropped rather than passed through. */
function keepKnown<T extends string>(raw: unknown, allowed: readonly T[], cap = 5): T[] {
  if (!Array.isArray(raw)) return []
  const out: T[] = []
  for (const value of raw) {
    if (typeof value !== 'string') continue
    const match = allowed.find((a) => a.toLowerCase() === value.trim().toLowerCase())
    if (match && !out.includes(match)) out.push(match)
    if (out.length >= cap) break
  }
  return out
}

function money(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0 || raw > 10_000) return null
  return Math.round(raw * 100) / 100
}

/**
 * Read a completion into a patch, keeping only what the catalogue can honour.
 *
 * Never throws and never trusts: a malformed body, an unknown tag, a category we
 * stopped stocking and a negative price all reduce to nothing. The caller treats
 * an empty patch as "the model had no useful reading", which is a perfectly good
 * outcome for a fallback.
 */
export function parseIntentResult(raw: unknown, products: CatalogueProduct[]): IntentPatch {
  let body: Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      body = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return EMPTY_PATCH
    }
  } else if (raw && typeof raw === 'object') {
    body = raw as Record<string, unknown>
  } else {
    return EMPTY_PATCH
  }

  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))]

  return {
    dietary: keepKnown(body.dietary, DIETARY_TAGS),
    goals: keepKnown(body.goals, ALL_GOALS),
    slots: keepKnown(body.slots, STACK_SLOTS),
    categories: keepKnown(body.categories, categories),
    priceMax: money(body.priceMax),
    priceMin: money(body.priceMin),
    stimFree: body.stimFree === true,
    text: typeof body.text === 'string' ? body.text.trim().slice(0, 80) : '',
  }
}

/**
 * Should the fallback even be asked?
 *
 * Only for a sentence — a few words at least — that the local pass could make
 * nothing of. A query that already returns products is answered; sending it away
 * to be answered again would trade a working instant result for a slower one.
 */
export function shouldAskModel(query: string, localResultCount: number, localIntentCount: number): boolean {
  if (localResultCount > 0 || localIntentCount > 0) return false
  return query.trim().split(/\s+/).filter(Boolean).length >= 3
}
