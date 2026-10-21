import type { QuizAnswers } from './types'
import { DRIVERS, NOTED, type DriverId } from './quiz-v2/drivers'

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

const stripMd = (s: string) => s.replace(/\*+/g, '').replace(/_{2,}/g, '').trim()

// ─── Blueprint slot personalisation ──────────────────────────────────────────
// The main flow shows a slot-based stack (protein / performance / sleep …). The
// deterministic factory decides which slots exist, the budget cap and every hard
// gate (caffeine, vegan, allergens, already-taking, narrow-use exclusions); the
// AI may then pick a different product for a slot from that slot's
// already-eligible options. It returns product ids and nothing else.
//
// It used to write each slot's "why" as well. No one reviewed that text before
// a customer read it, so the model now writes no customer text at all; the
// parser drops any it sends anyway.
//
// No budget is sent either. The quiz does not ask for one, so the line the
// prompt used to carry ("£50–80/month", with a rule never to exceed it) was a
// default standing in for an answer nobody gave. Where a cap does apply, the
// engine and `applyBlueprintAIResultWithinBudget` enforce it in code.

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
    /** The catalogue's own one-line summary, as context for the choice. */
    reason: string
    /** The swap group's claims, as context for the choice. Never shown to a
     *  customer, and the model writes nothing from them. */
    claims: string[]
  }>
}

export interface BlueprintAIResult {
  /** Chosen product id per slotId (already validated against that slot's options). */
  choices: Record<string, string>
}

export const BLUEPRINT_SYSTEM_PROMPT = `You choose products for one person's supplement stack at CHRGD, a UK supplement brand. You only choose. You do not write anything the customer will read.

The stack has fixed slots (each a job like Protein or Sleep). For each slot you are given a short list of eligible product options. Every option has already passed the brand's safety and eligibility checks, so any of them may be chosen.
- For each slot, pick the single option that best fits this person's goals, training, diet and lifestyle. Choose by id, from that slot's options only. Never invent ids or move a product between slots.
- Each slot's current pick is the one the brand's rules chose. Where options fit equally well, keep it.
- Prices are shown for reference only. There is no budget to aim for or to fill, so choose on fit, not on price.
- Do not write reasons, descriptions, sales copy or any other text.
- Respond with a single JSON object only, no prose: {"choices":{"slotId":"productId", ...}}`

export function buildBlueprintPrompt(answers: QuizAnswers, slots: SlotOption[]): string {
  const goalText = answers.goals.map(g => GOAL_LABELS[g] ?? g).join(', ') || 'general wellbeing'
  const age = answers.exactAge ? `${answers.exactAge}` : (answers.ageBracket ?? 'unknown')
  const lifestyle = answers.lifestyle.length ? answers.lifestyle.join(', ') : 'none noted'

  // Q&A from the AI deep-dive step — the root-cause context behind the goals
  // (e.g. WHY this person is low on energy), which the flat profile can't carry.
  const deepDive = Object.values(answers.dynamicAnswers ?? {})
    .filter(d => d.question && d.answer)
    .map(d => `- ${stripMd(d.question)} → ${stripMd(d.answer)}`)

  /*
   * ── The same slot, filled from v2's drivers ──────────────────────────────
   *
   * The DEEPER CONTEXT block exists to carry WHY this person is low on energy,
   * which the flat profile cannot. v1 fills it from the deep-dive follow-ups;
   * v2 has no deep-dive step — its whole run is root-cause questions — so on
   * the v2 arm the block was empty and the personaliser was working from LESS
   * than it gets on v1, having been told MORE. Exactly backwards.
   *
   * The strings are `DRIVERS[].heard`, which are pre-written, reviewed, and
   * already what the recap screen says to the member's face. Nothing here is
   * generated, and no confidence figure goes over — a decimal in a prompt reads
   * as precision this does not have.
   */
  const drivers = Object.entries(answers.drivers ?? {})
    .filter(([id, weight]) => typeof weight === 'number' && weight >= NOTED && DRIVERS[id as DriverId])
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([id]) => `- ${DRIVERS[id as DriverId].heard}`)

  const context = [...deepDive, ...drivers]

  const slotBlocks = slots.map(s => {
    const opts = s.options.map(o => {
      const flags = [o.vegan ? 'vegan' : null, o.stimulant ? 'stimulant' : null].filter(Boolean).join(', ')
      const claims = o.claims.length ? ` | approved claims: ${o.claims.join('; ')}` : ''
      return `    - ${o.id} | ${o.name} | ${o.category} | £${o.price.toFixed(2)}${flags ? ` | ${flags}` : ''} | ${o.reason}${claims}`
    })
    return `  Slot "${s.slotId}" (${s.title} — ${s.description}); current: ${s.currentProductId}\n${opts.join('\n')}`
  })

  return `Choose this person's stack.

PERSON
- Age: ${age}
- Goals: ${goalText}
- Training: ${answers.trainingFrequency ?? 'unknown'} per week, ${answers.trainingType?.length ? answers.trainingType.join(' & ') : 'mixed'}-focused
- Diet: ${answers.diet ?? 'balanced'}
- Lifestyle factors: ${lifestyle}
- Caffeine preference: ${answers.caffeineLevel ?? 'moderate'}
${context.length ? `\nDEEPER CONTEXT (what they told us about why — use this to break ties between options)\n${context.join('\n')}\n` : ''}
SLOTS (pick one product id per slot, from that slot's options only)
${slotBlocks.join('\n')}`
}

/**
 * Validates the model output against each slot's allowed option ids. Choices for
 * unknown slots or ids outside that slot's options are dropped. Anything else in
 * the reply is ignored, including the `reasons` object the old prompt asked for:
 * a model that still writes one gets its choices read and its prose discarded,
 * so no model-written sentence leaves this function. Returns null when no usable
 * choice came back.
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

  if (Object.keys(choices).length === 0) return null
  return { choices }
}
