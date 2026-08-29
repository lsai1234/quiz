import type { BankQuestion, InterviewState } from './types'
import { DRIVERS, rankedDrivers } from './drivers'
import { GOAL_LABELS } from '@/lib/quiz-goals'

/**
 * The AI steer — pure half.
 *
 * Prompt construction, the response schema and the validator, with no network
 * in sight, so the contract can be tested without OpenAI. Same split as
 * `ai-questions.ts` and `ai-stack.ts`.
 *
 * ── What the model is and is not allowed to do ──────────────────────────────
 * It is handed a shortlist of question ids the planner has already decided are
 * eligible, and asked to put them in a better order for this specific person.
 * It may also reword a prompt and write one line of acknowledgement.
 *
 * It cannot author a question, invent an option, change what an option means,
 * reach a question the planner did not offer, or touch the safety screen. Not
 * by policy — by construction: the only field that affects the flow is a list
 * of strings, and every string not already in the candidate set is dropped
 * before it reaches the planner. This is what makes "we use AI to pick your
 * next question" a safe sentence for a supplement brand to say.
 *
 * ── What is sent ────────────────────────────────────────────────────────────
 * Goals, driver confidences, question ids. No name, no age, no free text, no
 * answers in their own words — because none of it improves the ordering, and a
 * payload that carries a person's details to a third party needs a better
 * reason than "it was to hand".
 */

export const MAX_CANDIDATES = 10
/** Hard ceiling on the reworded copy, matching the renderer's line budget. */
const MAX_PROMPT = 90
const MAX_HINT = 120
const MAX_REFLECTION = 110

export interface SteerRequest {
  goals: string[]
  primaryGoal: string | null
  /** driverId → confidence, only the settled ones. */
  drivers: Record<string, number>
  asked: string[]
  remaining: number
  candidates: Array<{ id: string; asks: string }>
  /** The question just answered and what was chosen, so the reflection can
   *  refer to it. Option LABELS, which are our words, never the user's. */
  lastAnswer: { question: string; chose: string } | null
}

export interface SteerResult {
  /** Candidate ids, best first. Anything unrecognised is dropped. */
  order: string[]
  /** Reworded copy, keyed by candidate id. */
  copy: Record<string, { prompt?: string; hint?: string }>
  /** One line acknowledging the last answer, or null. */
  reflection: string | null
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

export const STEER_SYSTEM_PROMPT = `You are helping run a supplement quiz for CHRGD, a premium UK brand. The quiz has already chosen a shortlist of questions it could ask this person next. Your job is to put that shortlist in the best order for them, and optionally sharpen the wording of the top one so it clearly follows from what they just said.

Rules:
- Choose ONLY from the candidate ids given. Never invent a question, an option or an id.
- Order by what would tell us most about THIS person right now, given their goals and what we already suspect. Prefer a question that follows naturally from their last answer over one that changes the subject.
- Rewording is optional and must not change what the question asks. Keep it under 12 words, UK English, warm and direct. You may refer to their last answer ("You said mornings are slow — how are the nights?").
- The reflection is one short sentence acknowledging what their last answer told us. Never a diagnosis, never advice, never a product. Plain observation only. Omit it rather than pad it.
- NEVER mention symptoms, health conditions, medication, pain or diagnosis. These are lifestyle questions, not a health screen.
- Plain text. No markdown, no emoji.`

export function buildSteerPrompt(req: SteerRequest): string {
  const goals = req.goals.map((g) => GOAL_LABELS[g] ?? g).join(', ') || 'general wellbeing'
  const drivers = Object.entries(req.drivers)
    .map(([id, w]) => `${id} (${w.toFixed(2)}): ${DRIVERS[id as keyof typeof DRIVERS]?.heard ?? id}`)
    .join('\n') || 'nothing established yet'

  return `Order the shortlist for this person.

WHAT WE KNOW
- Goals: ${goals}${req.primaryGoal ? ` (leading with: ${GOAL_LABELS[req.primaryGoal] ?? req.primaryGoal})` : ''}
- What we suspect so far:
${drivers}
${req.lastAnswer ? `- They were just asked "${req.lastAnswer.question}" and chose "${req.lastAnswer.chose}".` : ''}
- Questions still to come: ${req.remaining}

SHORTLIST — choose and order from these ids only
${req.candidates.map((c) => `- ${c.id}: ${c.asks}`).join('\n')}`
}

export function buildSteerRequest(
  state: InterviewState,
  candidates: BankQuestion[],
  lastQuestion: BankQuestion | null,
): SteerRequest {
  const lastPicked = lastQuestion ? (state.picked[lastQuestion.id] ?? []) : []
  const choseLabels = lastQuestion
    ? lastQuestion.options.filter((o) => lastPicked.includes(o.id)).map((o) => o.label)
    : []

  return {
    goals: state.goals,
    primaryGoal: state.primaryGoal,
    drivers: Object.fromEntries(rankedDrivers(state.drivers).map((d) => [d.id, d.weight])),
    asked: state.asked,
    remaining: Math.max(0, state.budget - state.asked.length),
    candidates: candidates.slice(0, MAX_CANDIDATES).map((q) => ({ id: q.id, asks: q.summary })),
    lastAnswer:
      lastQuestion && choseLabels.length > 0
        ? { question: lastQuestion.prompt, chose: choseLabels.join(', ') }
        : null,
  }
}

// ─── Structured output ────────────────────────────────────────────────────────

export const STEER_JSON_SCHEMA = {
  type: 'object',
  properties: {
    order: { type: 'array', items: { type: 'string' } },
    copy: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          prompt: { type: ['string', 'null'] },
          hint: { type: ['string', 'null'] },
        },
        required: ['id', 'prompt', 'hint'],
        additionalProperties: false,
      },
    },
    reflection: { type: ['string', 'null'] },
  },
  required: ['order', 'copy', 'reflection'],
  additionalProperties: false,
} as const

// ─── Validation ───────────────────────────────────────────────────────────────

const stripMd = (s: string) => s.replace(/[*_`#]+/g, '').trim()

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = stripMd(v).replace(/\s+/g, ' ').slice(0, max).trim()
  return s || null
}

/**
 * Model output → something safe to act on.
 *
 * The `allowed` set is the whole security model. Every id is checked against
 * the candidates the planner actually offered, so a hallucinated question id, a
 * stale one from an earlier turn, or a deliberate attempt to reach the safety
 * screen all land in the same place: dropped, and the planner's own order
 * stands. Returns null when nothing usable survives, which the caller treats
 * exactly like a timeout.
 */
export function parseSteerResult(raw: unknown, allowed: string[]): SteerResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const allow = new Set(allowed)

  const order: string[] = []
  if (Array.isArray(r.order)) {
    for (const id of r.order) {
      if (typeof id === 'string' && allow.has(id) && !order.includes(id)) order.push(id)
    }
  }

  const copy: SteerResult['copy'] = {}
  if (Array.isArray(r.copy)) {
    for (const item of r.copy) {
      if (!item || typeof item !== 'object') continue
      const c = item as Record<string, unknown>
      if (typeof c.id !== 'string' || !allow.has(c.id)) continue
      const prompt = clean(c.prompt, MAX_PROMPT)
      const hint = clean(c.hint, MAX_HINT)
      if (!prompt && !hint) continue
      copy[c.id] = { ...(prompt ? { prompt } : {}), ...(hint ? { hint } : {}) }
    }
  }

  const reflection = clean(r.reflection, MAX_REFLECTION)

  if (order.length === 0 && Object.keys(copy).length === 0 && !reflection) return null
  return { order, copy, reflection }
}
