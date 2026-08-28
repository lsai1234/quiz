/**
 * AI "auto-sort" — infer the missing classification/config for products that
 * aren't launch-ready (slots, goals, swap group, subscription settings, cost,
 * recommendation basis). Uses OpenAI when a key is set, with a deterministic
 * keyword heuristic fallback so it always works (e.g. in mock dev).
 */
import OpenAI from 'openai'
import { STACK_SLOTS, type StackSlot, type SwapGroup, type DietaryTag } from '@/lib/catalogue/types'
import type { CatalogueProduct } from '@/lib/catalogue/types'
import type { Goal } from '@/lib/types'
import { getPricingConfig } from '@/lib/stack-blueprint/pricing'
import { validateShortName, SHORT_NAME_RULES } from '@/lib/catalogue/short-name'

const VALID_GOALS: Goal[] = ['muscle', 'energy', 'performance', 'hydration', 'recovery', 'health', 'cutting', 'bulking', 'sleep-better', 'less-stress', 'focus', 'immune', 'skin-hair-nails', 'menopause', 'gut-health']
// Every group the engine knows. A model answer outside this list is discarded
// and the heuristic's group used instead — so a group missing from here is a
// group the model can never successfully assign, however right it is.
// `joint-support` was missing for exactly that reason.
const VALID_SWAP: SwapGroup[] = ['protein-whey', 'protein-plant', 'protein-mass', 'protein-clear', 'creatine', 'pre-workout-stim', 'pre-workout-stim-free', 'aminos', 'electrolytes', 'omega-3', 'magnesium', 'vitamin-d', 'multivitamin', 'collagen', 'joint-support', 'sleep-support', 'fat-burner', 'adaptogen', 'probiotic', 'greens', 'fibre', 'menopause', 'vitamin-c', 'protein-bar', 'nootropic', 'vitamin-b', 'zma', 'energy-gel', 'accessory', 'general']
const PER_WORKOUT_SLOTS: StackSlot[] = ['energy', 'hydration']

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey }) : null
}

// ─── Deterministic heuristic (fallback) ──────────────────────────────────────

const KEYWORDS: { match: RegExp; slots: StackSlot[]; goals: Goal[]; swap: SwapGroup }[] = [
  { match: /whey|isolate|casein/i, slots: ['protein'], goals: ['muscle', 'recovery'], swap: 'protein-whey' },
  { match: /plant protein|vegan protein/i, slots: ['protein', 'vegan-support'], goals: ['muscle', 'recovery'], swap: 'protein-plant' },
  { match: /mass|gainer/i, slots: ['protein'], goals: ['bulking', 'muscle'], swap: 'protein-mass' },
  { match: /creatine/i, slots: ['performance'], goals: ['muscle', 'performance'], swap: 'creatine' },
  { match: /stim-free|stimulant-free/i, slots: ['energy'], goals: ['energy', 'performance'], swap: 'pre-workout-stim-free' },
  { match: /pre-?workout/i, slots: ['energy'], goals: ['energy', 'performance'], swap: 'pre-workout-stim' },
  { match: /electrolyte|hydration/i, slots: ['hydration'], goals: ['hydration', 'performance'], swap: 'electrolytes' },
  { match: /bcaa|eaa|amino/i, slots: ['recovery', 'hydration'], goals: ['recovery'], swap: 'aminos' },
  { match: /collagen/i, slots: ['recovery'], goals: ['recovery', 'skin-hair-nails'], swap: 'collagen' },
  { match: /omega|fish oil/i, slots: ['health'], goals: ['health', 'focus'], swap: 'omega-3' },
  { match: /magnesium/i, slots: ['sleep', 'recovery'], goals: ['sleep-better', 'less-stress'], swap: 'magnesium' },
  { match: /vitamin d/i, slots: ['health'], goals: ['health', 'immune'], swap: 'vitamin-d' },
  { match: /multivitamin|multi-vitamin/i, slots: ['health'], goals: ['health', 'immune', 'energy'], swap: 'multivitamin' },
  { match: /sleep|ashwagandha|theanine/i, slots: ['sleep', 'recovery'], goals: ['sleep-better', 'less-stress'], swap: 'sleep-support' },
  { match: /probiotic|gut|greens|fibre|digestive/i, slots: ['gut', 'health'], goals: ['gut-health', 'health'], swap: 'probiotic' },
  { match: /vitamin c|zinc/i, slots: ['health'], goals: ['immune', 'health'], swap: 'vitamin-c' },
  { match: /menopause|perimenopause|hormonal/i, slots: ['menopause', 'health'], goals: ['menopause', 'health'], swap: 'menopause' },
]

/**
 * NOTE: this deliberately does not set `shortName`.
 *
 * The heuristic could trivially call `deriveShortName` — but that is exactly
 * what `shortNameOf` already computes on the fly for a product with no stored
 * name, so storing it adds nothing to what anyone sees. What it would change is
 * that the product then counts as NAMED: the founders' short-name panel would
 * stop listing it, and the one pass that can actually improve on the derivation
 * would never be offered for it.
 *
 * So a blank short name is the honest state for a product no model has looked
 * at, and only the AI branch below fills it in.
 */
export function heuristicClassify(p: CatalogueProduct): Partial<CatalogueProduct> {
  const text = `${p.title} ${p.description} ${p.category}`
  const hit = KEYWORDS.find((k) => k.match.test(text))
  const stackSlots: StackSlot[] = hit ? hit.slots : ['health']
  const goals: Goal[] = hit ? hit.goals : ['health']
  const swapGroup: SwapGroup = hit ? hit.swap : 'general'
  const perWorkout = stackSlots.some((s) => PER_WORKOUT_SLOTS.includes(s))
  return {
    stackSlots,
    goals,
    swapGroup,
    hasStimulants: /caffeine|stimulant|pre-?workout/i.test(text) && !/stim-free/i.test(text),
    subscriptionEligible: true,
    servings: 30,
    consumption: { cadence: perWorkout ? 'per-workout' : 'daily', servingsPerUnit: 30 },
    recommendationBasis: perWorkout || stackSlots.some((s) => ['sleep', 'recovery', 'gut', 'menopause'].includes(s)) ? 'subjective' : 'objective',
    cost: Math.round(p.basePrice * getPricingConfig().defaultCostRatio * 100) / 100,
  }
}

// ─── AI classification ───────────────────────────────────────────────────────

const SYSTEM = `You are a supplements catalogue expert. Given a product, classify it for a UK supplement store. Reply ONLY with JSON:
{"shortName":"","stackSlots":[],"goals":[],"dietaryTags":[],"swapGroup":"","hasStimulants":false,"subscriptionEligible":true,"servings":30,"cadence":"daily|per-workout","recommendationBasis":"objective|subjective"}
- shortName: what this product is called where there is no room for its full
  title — a card, and the share poster. Rules:
${SHORT_NAME_RULES}
- stackSlots from: ${STACK_SLOTS.join(', ')}
- goals from: ${VALID_GOALS.join(', ')}
- dietaryTags from: vegan, vegetarian, gluten-free, dairy-free, nut-free, halal, keto-friendly
- swapGroup from: ${VALID_SWAP.join(', ')}
- cadence: 'per-workout' for pre-workout/electrolytes/intra-workout, else 'daily'
- recommendationBasis: 'subjective' if the benefit is felt (energy, sleep, recovery, gut), 'objective' if it's a need you don't feel (protein, creatine, vitamins)
- servings: approx number of servings in one container at the normal dose`

export async function aiClassifyProduct(p: CatalogueProduct): Promise<{ patch: Partial<CatalogueProduct>; source: 'ai' | 'heuristic' }> {
  const client = getClient()
  const heuristic = heuristicClassify(p)
  if (!client) return { patch: heuristic, source: 'heuristic' }

  try {
    const completion = await client.chat.completions.create(
      {
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Title: ${p.title}\nDescription: ${p.description}\nCategory: ${p.category}\nPrice: £${p.basePrice}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 300,
        temperature: 0.2,
      },
      { timeout: 9000 },
    )
    const raw = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
    const slots = ((raw.stackSlots ?? []) as string[]).filter((s): s is StackSlot => STACK_SLOTS.includes(s as StackSlot))
    const goals = ((raw.goals ?? []) as string[]).filter((g): g is Goal => VALID_GOALS.includes(g as Goal))
    const dietary = ((raw.dietaryTags ?? []) as string[]).filter((d): d is DietaryTag => ['vegan', 'vegetarian', 'gluten-free', 'dairy-free', 'nut-free', 'halal', 'keto-friendly'].includes(d))
    const swap = VALID_SWAP.includes(raw.swapGroup) ? raw.swapGroup : heuristic.swapGroup
    const cadence = raw.cadence === 'per-workout' ? 'per-workout' : 'daily'
    const basis = raw.recommendationBasis === 'subjective' ? 'subjective' : 'objective'
    const servingsVal = Number.isFinite(raw.servings) && raw.servings > 0 ? Math.round(raw.servings) : 30
    // Through the SAME gate the founders' short-name pass uses — claim lint,
    // grounding, length — rather than trusted because it arrived inside a
    // classification. A refused name is simply left off the patch: `shortNameOf`
    // then derives one from the title, so the product still has a usable name
    // and the founders' panel still lists it as one the AI could improve.
    const named = typeof raw.shortName === 'string' ? validateShortName(raw.shortName, p) : null
    return {
      source: 'ai',
      patch: {
        ...(named?.ok ? { shortName: named.shortName } : {}),
        stackSlots: slots.length ? slots : heuristic.stackSlots,
        goals: goals.length ? goals : heuristic.goals,
        dietaryTags: dietary,
        swapGroup: swap,
        hasStimulants: !!raw.hasStimulants,
        subscriptionEligible: raw.subscriptionEligible !== false,
        servings: servingsVal,
        consumption: { cadence, servingsPerUnit: servingsVal },
        recommendationBasis: basis,
        cost: heuristic.cost, // cost stays an estimate, not an AI guess
      },
    }
  } catch {
    return { patch: heuristic, source: 'heuristic' }
  }
}

/** Only the fields the product is currently missing — so auto-sort fills gaps, not deliberate edits. */
export function gapPatch(p: CatalogueProduct, suggestion: Partial<CatalogueProduct>): Partial<CatalogueProduct> {
  const patch: Partial<CatalogueProduct> = {}
  if (p.stackSlots.length === 0 && suggestion.stackSlots) patch.stackSlots = suggestion.stackSlots
  if (p.goals.length === 0 && suggestion.goals) patch.goals = suggestion.goals
  if ((!p.swapGroup || p.swapGroup === 'general') && suggestion.swapGroup) patch.swapGroup = suggestion.swapGroup
  if (p.dietaryTags.length === 0 && suggestion.dietaryTags?.length) patch.dietaryTags = suggestion.dietaryTags
  if (!(p.servings > 0) && suggestion.servings) patch.servings = suggestion.servings
  if (p.cost == null && suggestion.cost != null) patch.cost = suggestion.cost
  if (!p.recommendationBasis && suggestion.recommendationBasis) patch.recommendationBasis = suggestion.recommendationBasis
  if (!p.consumption && suggestion.consumption) patch.consumption = suggestion.consumption
  if (!p.shortName?.trim() && suggestion.shortName) patch.shortName = suggestion.shortName
  return patch
}
