import type { QuizAnswers, Product } from './types'
import { getRole } from './product-roles'

// Pure, network-free helpers for the AI stack ranker. Kept separate from the
// route handler so the prompt shape and output validation can be unit-tested
// without calling OpenAI.

const GOAL_LABELS: Record<string, string> = {
  muscle: 'build muscle',
  energy: 'boost energy',
  performance: 'improve athletic performance',
  hydration: 'optimise hydration',
  recovery: 'speed up recovery',
  health: 'support general health and longevity',
  cutting: 'lose body fat',
  bulking: 'gain mass',
  'sleep-better': 'sleep better',
  'less-stress': 'manage stress',
  focus: 'improve focus and reduce brain fog',
  immune: 'support immune health',
  'skin-hair-nails': 'support skin, hair and nails',
  'gut-health': 'improve gut health and digestion',
  menopause: 'support hormonal balance through menopause',
}

const BUDGET_LABELS: Record<string, string> = {
  'under-30': 'under £30/month',
  '30-50': '£30–50/month',
  '50-80': '£50–80/month',
  '80-plus': '£80+/month',
}

/** The structured shape we ask the model to return. */
export interface AIStackResult {
  /** Eligible product ids, ordered most-important first. */
  order: string[]
  /** Short, personalised reason per recommended product id. */
  reasons: Record<string, string>
}

/**
 * System role for the ranker. Establishing the rules here (rather than only in
 * the user turn) improves instruction adherence and keeps the per-request user
 * prompt — and therefore token cost — small. Health-claim guardrails mirror the
 * existing identity prompt so generated copy stays advertising-compliant.
 */
export const RANKING_SYSTEM_PROMPT = `You are a specialist nutrition advisor for CHRGD, a premium UK supplement brand. You assemble personalised supplement stacks.

Rules:
- Recommend ONLY from the eligible product ids given in the user message. Never invent products or ids.
- Rank by how well each product fits this specific person's goals, lifestyle, training and budget — most important first. You need not include every product, but cover their main goals.
- Write one reason per recommended product: a single sentence, max 18 words, warm and specific to this person, plain text (no markdown or asterisks).
- No medical claims and no guaranteed outcomes. Say "may support", never "will improve". Never suggest a supplement can treat, manage or replace medical care for any condition.
- Respond with a single JSON object only, no prose: {"order":["id", ...],"reasons":{"id":"reason", ...}}`

/**
 * Builds the per-request user prompt: the person's profile and the eligible
 * candidate list. The model is only ever shown candidates that already passed
 * the deterministic gates, so it can re-rank but cannot recommend something the
 * rules forbid.
 */
export function buildRankingPrompt(answers: QuizAnswers, candidates: Product[]): string {
  const firstName = answers.name?.split(' ')[0]?.trim() || null
  const goalText = answers.goals.map(g => GOAL_LABELS[g] ?? g).join(', ') || 'general wellbeing'
  const budget = BUDGET_LABELS[answers.budget ?? ''] ?? '£50–80/month'
  const age = answers.exactAge ? `${answers.exactAge}` : (answers.ageBracket ?? 'unknown')
  const gender = answers.gender && answers.gender !== 'not-specified' ? answers.gender : 'unspecified'
  const lifestyle = answers.lifestyle.length ? answers.lifestyle.join(', ') : 'none noted'
  const current = answers.currentSupplements.length ? answers.currentSupplements.join(', ') : 'none'

  const lines = candidates.map(p => {
    const flags = [p.stimulant ? 'stimulant' : null, p.vegan ? 'vegan' : null, p.beginner ? 'beginner-friendly' : null]
      .filter(Boolean)
      .join(', ')
    return `- ${p.id} | ${p.name} | role: ${getRole(p).label} | ${p.category} | £${p.price.toFixed(2)} | goals: ${p.goalTags.join('/')}${flags ? ` | ${flags}` : ''}`
  })

  return `Build the ideal personalised stack for this person.

PERSON
${firstName ? `- Name: ${firstName}` : ''}
- Age: ${age}
- Gender: ${gender}
- Goals: ${goalText}
- Training: ${answers.trainingFrequency ?? 'unknown'} per week, ${answers.trainingType ?? 'mixed'}-focused
- Diet: ${answers.diet ?? 'balanced'}
- Lifestyle factors: ${lifestyle}
- Caffeine preference: ${answers.caffeineLevel ?? 'moderate'}
- Already taking: ${current}
- Monthly budget: ${budget}
- Stack preference: ${answers.stackPreference ?? 'balanced'}

ELIGIBLE PRODUCTS (choose only from these ids)
${lines.join('\n')}`
}

const stripMd = (s: string) => s.replace(/\*+/g, '').replace(/_{2,}/g, '').trim()

/**
 * Validates and normalises the model's raw output: keeps only ids that exist in
 * the eligible set, de-duplicates the order, and sanitises/truncates the reason
 * strings. Returns null if nothing usable came back so the caller can fall back.
 */
export function parseAIStackResult(raw: unknown, eligibleIds: Set<string>): AIStackResult | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const rawOrder = Array.isArray(obj.order) ? obj.order : []
  const seen = new Set<string>()
  const order: string[] = []
  for (const id of rawOrder) {
    if (typeof id === 'string' && eligibleIds.has(id) && !seen.has(id)) {
      seen.add(id)
      order.push(id)
    }
  }

  const reasons: Record<string, string> = {}
  const rawReasons = obj.reasons && typeof obj.reasons === 'object' ? (obj.reasons as Record<string, unknown>) : {}
  for (const [id, reason] of Object.entries(rawReasons)) {
    if (!eligibleIds.has(id) || typeof reason !== 'string') continue
    const clean = stripMd(reason).slice(0, 160)
    if (clean) reasons[id] = clean
  }

  if (order.length === 0) return null
  return { order, reasons }
}

// ─── Blueprint slot personalisation ──────────────────────────────────────────
// The main flow shows a slot-based stack (protein / performance / sleep …). The
// deterministic factory decides which slots exist, the budget cap and every hard
// gate; the AI then picks the best product to fill each slot from that slot's
// already-eligible options and writes the personalised reason.

/** One slot offered to the model, with its eligible product options. */
export interface SlotOption {
  slotId: string
  title: string
  description: string
  currentProductId: string
  options: Array<{
    id: string
    name: string
    category: string
    price: number
    vegan: boolean
    stimulant: boolean
    reason: string
  }>
}

export interface BlueprintAIResult {
  /** Chosen product id per slotId (already validated against that slot's options). */
  choices: Record<string, string>
  /** Personalised reason per slotId. */
  reasons: Record<string, string>
}

export const BLUEPRINT_SYSTEM_PROMPT = `You are a specialist nutrition advisor for CHRGD, a premium UK supplement brand. You personalise a supplement stack for one person.

The stack has fixed slots (each a job like Protein or Sleep). For each slot you are given a short list of eligible product options. Your job:
- Pick the single best product option for this specific person for each slot — choose by id, from that slot's options only. Never invent ids or move a product between slots.
- Write one reason per slot: a single sentence, max 20 words, warm and specific to this person, explaining why that product suits them. Plain text, no markdown or asterisks.
- No medical claims, no guaranteed outcomes. Say "may support", never "will improve". Never suggest a supplement can treat, manage or replace medical care for any condition.
- Respond with a single JSON object only, no prose: {"choices":{"slotId":"productId", ...},"reasons":{"slotId":"reason", ...}}`

export function buildBlueprintPrompt(answers: QuizAnswers, slots: SlotOption[]): string {
  const firstName = answers.name?.split(' ')[0]?.trim() || null
  const goalText = answers.goals.map(g => GOAL_LABELS[g] ?? g).join(', ') || 'general wellbeing'
  const budget = BUDGET_LABELS[answers.budget ?? ''] ?? '£50–80/month'
  const age = answers.exactAge ? `${answers.exactAge}` : (answers.ageBracket ?? 'unknown')
  const lifestyle = answers.lifestyle.length ? answers.lifestyle.join(', ') : 'none noted'

  const slotBlocks = slots.map(s => {
    const opts = s.options.map(o => {
      const flags = [o.vegan ? 'vegan' : null, o.stimulant ? 'stimulant' : null].filter(Boolean).join(', ')
      return `    - ${o.id} | ${o.name} | ${o.category} | £${o.price.toFixed(2)}${flags ? ` | ${flags}` : ''} | ${o.reason}`
    })
    return `  Slot "${s.slotId}" (${s.title} — ${s.description}); current: ${s.currentProductId}\n${opts.join('\n')}`
  })

  return `Personalise this person's stack.

PERSON
${firstName ? `- Name: ${firstName}` : ''}
- Age: ${age}
- Goals: ${goalText}
- Training: ${answers.trainingFrequency ?? 'unknown'} per week, ${answers.trainingType ?? 'mixed'}-focused
- Diet: ${answers.diet ?? 'balanced'}
- Lifestyle factors: ${lifestyle}
- Caffeine preference: ${answers.caffeineLevel ?? 'moderate'}
- Monthly budget: ${budget}

SLOTS (pick one product id per slot, from that slot's options only)
${slotBlocks.join('\n')}`
}

/**
 * Validates the model output against each slot's allowed option ids. Choices for
 * unknown slots or ids outside that slot's options are dropped; reasons are
 * sanitised. Returns null when nothing usable came back.
 */
export function parseBlueprintResult(
  raw: unknown,
  optionIdsBySlot: Record<string, Set<string>>,
): BlueprintAIResult | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const choices: Record<string, string> = {}
  const rawChoices = obj.choices && typeof obj.choices === 'object' ? (obj.choices as Record<string, unknown>) : {}
  for (const [slotId, productId] of Object.entries(rawChoices)) {
    const allowed = optionIdsBySlot[slotId]
    if (allowed && typeof productId === 'string' && allowed.has(productId)) {
      choices[slotId] = productId
    }
  }

  const reasons: Record<string, string> = {}
  const rawReasons = obj.reasons && typeof obj.reasons === 'object' ? (obj.reasons as Record<string, unknown>) : {}
  for (const [slotId, reason] of Object.entries(rawReasons)) {
    if (!optionIdsBySlot[slotId] || typeof reason !== 'string') continue
    const clean = stripMd(reason).slice(0, 180)
    if (clean) reasons[slotId] = clean
  }

  if (Object.keys(choices).length === 0 && Object.keys(reasons).length === 0) return null
  return { choices, reasons }
}
