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
 * Builds the ranking prompt. The model is only ever shown eligible candidates
 * (already filtered by the deterministic gates) and is told to pick from those
 * ids only — it cannot invent products. Health-claim guardrails mirror the
 * existing identity prompt so generated copy stays advertising-compliant.
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

  return `You are a specialist nutrition advisor for CHRGD, a premium UK supplement brand. Choose the ideal personalised supplement stack for this person from the eligible products below.

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

ELIGIBLE PRODUCTS (choose only from these ids — every one already fits this person's hard requirements)
${lines.join('\n')}

TASK
Rank the products that form the best stack for this person, most important first. Order by how well each fits their specific goals, lifestyle and budget. You do not have to include every product. Write one short personalised reason (max 18 words) for each product you include.

RULES
- Use only product ids from the list above.
- No medical claims, no guaranteed outcomes. Say "may support" not "will improve".
- Never suggest a supplement can treat, manage or replace medical care for any condition.
- Reasons are plain text — no markdown, no asterisks.

Return ONLY a JSON object (no markdown) with exactly:
{
  "order": ["product-id", ...],
  "reasons": { "product-id": "short personalised reason", ... }
}`
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
