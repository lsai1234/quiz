import type { QuizAnswers } from './types'

// Pure, network-free helpers for the AI blueprint personaliser. Kept separate
// from the route handler so the prompt shape and output validation can be
// unit-tested without calling OpenAI.

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

const stripMd = (s: string) => s.replace(/\*+/g, '').replace(/_{2,}/g, '').trim()

// ─── Blueprint slot personalisation ──────────────────────────────────────────
// The main flow shows a slot-based stack (protein / performance / sleep …). The
// deterministic factory decides which slots exist, the budget cap and every hard
// gate (caffeine, vegan, allergens, already-taking, narrow-use exclusions); the
// AI then picks the best product to fill each slot from that slot's
// already-eligible options and writes the personalised, sales-style reason.

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
    /** Approved, advertising-compliant claims the AI may draw on for this product. */
    claims: string[]
  }>
}

export interface BlueprintAIResult {
  /** Chosen product id per slotId (already validated against that slot's options). */
  choices: Record<string, string>
  /** Personalised reason per slotId. */
  reasons: Record<string, string>
}

export const BLUEPRINT_SYSTEM_PROMPT = `You are a specialist nutrition advisor and copywriter for CHRGD, a premium UK supplement brand. You personalise a supplement stack for one person and write the sales copy that sells it back to them.

The stack has fixed slots (each a job like Protein or Sleep). For each slot you are given a short list of eligible product options, each with a set of pre-approved claims. Your job:
- Pick the single best product option for this specific person for each slot — choose by id, from that slot's options only. Never invent ids or move a product between slots. Weigh their goals, training, lifestyle, diet and budget to make the best possible call — you have full discretion here, every option you're shown already passed the brand's hard safety/eligibility gates (e.g. no stimulant or allergen options are ever shown if the person opted out).
- Write one reason per slot: 1-2 sentences (roughly 25-40 words), warm, premium and specific to this person — sell them on why this exact product fits their goals and life. Ground every factual/benefit claim ONLY in that product's listed claims; you may rephrase and combine them naturally, but never invent a mechanism, benefit or outcome not listed. Plain text, no markdown or asterisks.
- No medical claims, no disease/cure/treatment language, no guaranteed outcomes. Say "may support" or "supports", never "will cure", "will fix" or "guarantees". Never suggest a supplement can treat, manage or replace medical care for any condition.
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
      const claims = o.claims.length ? ` | approved claims: ${o.claims.join('; ')}` : ''
      return `    - ${o.id} | ${o.name} | ${o.category} | £${o.price.toFixed(2)}${flags ? ` | ${flags}` : ''} | ${o.reason}${claims}`
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

BUDGET RULE
- The combined one-off list price of the products you choose must stay within the top of this person's monthly budget. If a pricier option would push the total over, choose a cheaper option from that slot that still fits. Use the budget well — but never exceed it.

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
    const clean = stripMd(reason).slice(0, 280)
    if (clean) reasons[slotId] = clean
  }

  if (Object.keys(choices).length === 0 && Object.keys(reasons).length === 0) return null
  return { choices, reasons }
}
