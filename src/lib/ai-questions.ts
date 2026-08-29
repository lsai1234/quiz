import type { QuizAnswers, QuizTrack } from './types'

// Pure, network-free helpers for the AI deep-dive question generator (the
// `deepDive` quiz step). Kept separate from the route handler so the prompt
// shape, output validation and fallbacks can be unit-tested without OpenAI —
// same split as ai-stack.ts.

// ─── Question shape ───────────────────────────────────────────────────────────

export interface DynamicOption {
  id: string
  label: string
  sub?: string
  /** Whitelisted lifestyle signal tags this option implies (see SIGNAL_TAGS). */
  signals: string[]
}

export interface DynamicQuestion {
  id: string
  question: string
  hint: string
  options: DynamicOption[]
}

// ─── Signal whitelist ─────────────────────────────────────────────────────────
// The only tags a generated option may carry — each one is a lifestyle flag the
// deterministic blueprint factory already reads as a SOFT scoring boost.
// Deliberately excludes 'vegan': that's a hard exclusion gate and dietary
// restrictions must only ever come from the user's explicit answers, never from
// AI inference. Signals from chosen options are unioned into answers.lifestyle
// for stack building (withDeepDiveSignals), so they can sharpen ranking but
// never exclude a product.

export const SIGNAL_TAGS = [
  'poor-sleep',
  'desk-job',
  'high-stress',
  'joint-issues',
  'shift-work',
  'run-down',
] as const

const SIGNAL_SET: Set<string> = new Set(SIGNAL_TAGS)

/** Answers with deep-dive signals folded into lifestyle, for the stack engine
 *  and AI prompts. The user's own lifestyle selections are never removed. */
export function withDeepDiveSignals(answers: QuizAnswers): QuizAnswers {
  const dyn = Object.values(answers.dynamicAnswers ?? {})
  if (dyn.length === 0) return answers
  const merged = new Set(answers.lifestyle)
  for (const d of dyn) for (const s of d.signals) if (SIGNAL_SET.has(s)) merged.add(s)
  if (merged.size === answers.lifestyle.length) return answers
  return { ...answers, lifestyle: [...merged] }
}

// ─── Limits ───────────────────────────────────────────────────────────────────

export const MAX_QUESTIONS = 3
const MIN_OPTIONS = 2
const MAX_OPTIONS = 5

// ─── Prompt ───────────────────────────────────────────────────────────────────

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

export const QUESTIONS_SYSTEM_PROMPT = `You are a specialist nutrition advisor for CHRGD, a premium UK supplement brand. Mid-way through the brand's quiz, you write 2-3 short follow-up questions tailored to this specific person, to uncover the day-to-day context behind their goals (two people can share a goal like "more energy" for completely different reasons — your questions find out which reasons apply here).

Rules:
- Ask about routine, context, habits and preferences ONLY — e.g. when their energy dips, what a typical day looks like, how evenings wind down, what training recovery feels like. NEVER ask about symptoms, health conditions, medication, pain, diagnosis or anything a clinician would ask. These are lifestyle questions, not a health screen.
- Never repeat or rephrase something the profile already answers. Each question must add new information.
- Each question is single-choice with 3-4 options. Options must be mutually exclusive, cover the likely range, and include a neutral/none option where sensible.
- Each option carries a "signals" array: zero or more tags from the allowed list, included ONLY when choosing that option clearly implies the tag. Most options carry no signals — never force one.
- Tone: warm, premium, direct, UK English. Questions under 12 words where possible; labels under 8 words; hints one short sentence explaining why you're asking. Plain text, no markdown, no emoji.
- ids: short kebab-case, unique across the response.`

/**
 * The person, as the model needs to see them.
 *
 * Deliberately no name. It was here and it bought nothing: this prompt picks
 * follow-up questions, and a question is no better for knowing the asker is
 * called Sam. Sending a customer's name to a third party needs a better reason
 * than that it was to hand. `generate-identity` still sends it, because that
 * one greets them by name and the name IS the output there.
 */
export function buildQuestionsPrompt(answers: QuizAnswers): string {
  const goalText = answers.goals.map(g => GOAL_LABELS[g] ?? g).join(', ') || 'general wellbeing'
  const age = answers.exactAge ? `${answers.exactAge}` : (answers.ageBracket ?? 'unknown')
  const lifestyle = answers.lifestyle.length ? answers.lifestyle.join(', ') : 'none noted'
  const wellbeing = Object.entries(answers.wellbeingAnswers ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')
  const training = answers.track === 'performance'
    ? `${answers.trainingFrequency ?? 'unknown frequency'}, ${answers.trainingType?.length ? answers.trainingType.join(' & ') : 'mixed'}${answers.trainingFocus ? ` (focus: ${answers.trainingFocus})` : ''}`
    : 'not a training-focused user — do not assume they train'

  return `Write the follow-up questions for this person.

PROFILE SO FAR
- Age: ${age}
- Track: ${answers.track ?? 'performance'}
- Goals: ${goalText}
- Training: ${training}
- Lifestyle flags they ticked: ${lifestyle}
${answers.diet ? `- Diet self-rating: ${answers.diet}` : ''}
${wellbeing ? `- Wellbeing follow-ups already answered: ${wellbeing}` : ''}

ALLOWED SIGNAL TAGS (use only these, only when clearly implied)
${SIGNAL_TAGS.map(t => `- ${t}`).join('\n')}

The quiz has already asked about (do NOT ask about these): diet quality, current supplements, caffeine tolerance, training/exercise time of day, product format preferences, budget.`
}

// ─── Structured-output JSON schema ────────────────────────────────────────────
// Strict mode: every field required, no additional properties; `sub` is
// string|null rather than optional.

export const QUESTIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          hint: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                sub: { type: ['string', 'null'] },
                signals: { type: 'array', items: { type: 'string', enum: [...SIGNAL_TAGS] } },
              },
              required: ['id', 'label', 'sub', 'signals'],
              additionalProperties: false,
            },
          },
        },
        required: ['id', 'question', 'hint', 'options'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
} as const

// ─── Output validation ────────────────────────────────────────────────────────

const stripMd = (s: string) => s.replace(/\*+/g, '').replace(/_{2,}/g, '').trim()

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = stripMd(v).slice(0, max).trim()
  return s || null
}

const cleanId = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return s || null
}

/**
 * Validates model output into renderable questions. Malformed questions and
 * options are dropped (never repaired into something the model didn't say),
 * signals are filtered to the whitelist, ids are deduped, and counts are
 * capped. Returns null when nothing usable came back.
 */
export function parseQuestionsResult(raw: unknown): DynamicQuestion[] | null {
  if (!raw || typeof raw !== 'object') return null
  const arr = (raw as Record<string, unknown>).questions
  if (!Array.isArray(arr)) return null

  const questions: DynamicQuestion[] = []
  const seenIds = new Set<string>()

  for (const item of arr) {
    if (questions.length >= MAX_QUESTIONS) break
    if (!item || typeof item !== 'object') continue
    const q = item as Record<string, unknown>

    const id = cleanId(q.id)
    const question = cleanText(q.question, 120)
    const hint = cleanText(q.hint, 160)
    if (!id || seenIds.has(id) || !question || !hint) continue
    if (!Array.isArray(q.options)) continue

    const options: DynamicOption[] = []
    const seenOptIds = new Set<string>()
    for (const o of q.options) {
      if (options.length >= MAX_OPTIONS) break
      if (!o || typeof o !== 'object') continue
      const opt = o as Record<string, unknown>
      const optId = cleanId(opt.id)
      const label = cleanText(opt.label, 60)
      if (!optId || seenOptIds.has(optId) || !label) continue
      const sub = cleanText(opt.sub, 80) ?? undefined
      const signals = Array.isArray(opt.signals)
        ? opt.signals.filter((s): s is string => typeof s === 'string' && SIGNAL_SET.has(s))
        : []
      seenOptIds.add(optId)
      options.push({ id: optId, label, ...(sub ? { sub } : {}), signals })
    }

    if (options.length < MIN_OPTIONS) continue
    seenIds.add(id)
    questions.push({ id, question, hint, options })
  }

  return questions.length > 0 ? questions : null
}

// ─── Static fallback bank ─────────────────────────────────────────────────────
// Shown when generation fails, times out or no API key is set — the step then
// behaves exactly like the hand-written follow-ups elsewhere in the quiz.

const PERFORMANCE_FALLBACK: DynamicQuestion[] = [
  {
    id: 'day-pattern',
    question: 'What does a typical day look like outside training?',
    hint: 'Day-to-day demands change what your body needs most',
    options: [
      { id: 'desk', label: 'Mostly at a desk', signals: ['desk-job'] },
      { id: 'on-feet', label: 'On my feet a lot', signals: [] },
      { id: 'shifts', label: 'Shift work / irregular hours', signals: ['shift-work'] },
      { id: 'mixed', label: 'A real mix', signals: [] },
    ],
  },
  {
    id: 'recovery-feel',
    question: 'How do you usually feel between sessions?',
    hint: 'Tells us whether to prioritise recovery or output',
    options: [
      { id: 'fresh', label: 'Recovered and ready', signals: [] },
      { id: 'tired-am', label: 'Wake up tired more than I should', signals: ['poor-sleep'] },
      { id: 'run-down', label: 'Run down when training ramps up', signals: ['run-down'] },
      { id: 'sore', label: 'Aches and niggles linger', signals: ['joint-issues'] },
    ],
  },
]

const WELLBEING_FALLBACK: DynamicQuestion[] = [
  {
    id: 'energy-dip',
    question: 'When does your energy usually dip?',
    hint: 'The pattern points to different kinds of support',
    options: [
      { id: 'morning', label: 'Slow mornings', signals: ['poor-sleep'] },
      { id: 'afternoon', label: 'Mid-afternoon slump', signals: [] },
      { id: 'evening', label: 'Evenings wipe me out', signals: [] },
      { id: 'steady', label: 'Fairly steady all day', signals: [] },
    ],
  },
  {
    id: 'day-pattern',
    question: 'What does your typical day involve?',
    hint: 'Daily rhythm shapes what we recommend',
    options: [
      { id: 'desk', label: 'Desk-based, mostly indoors', signals: ['desk-job'] },
      { id: 'busy', label: 'Busy and on the go', signals: [] },
      { id: 'shifts', label: 'Shift work / irregular hours', signals: ['shift-work'] },
      { id: 'demanding', label: 'Full-on — rarely a quiet moment', signals: ['high-stress'] },
    ],
  },
]

export function fallbackQuestions(track: QuizTrack | null): DynamicQuestion[] {
  return track === 'wellbeing' ? WELLBEING_FALLBACK : PERFORMANCE_FALLBACK
}

// ─── Answer fingerprint ───────────────────────────────────────────────────────

/** Stable fingerprint of the answers the questions are generated from — when it
 *  changes (user back-edited goals/lifestyle/etc.), questions are regenerated.
 *  Prefetch fires on arrival at the review step, so every field here is
 *  answered by then. */
export function deepDiveKey(answers: QuizAnswers): string {
  return JSON.stringify([
    answers.track,
    [...answers.goals].sort(),
    [...answers.lifestyle].sort(),
    answers.wellbeingAnswers ?? {},
    answers.trainingFrequency,
    [...(answers.trainingType ?? [])].sort(),
    answers.trainingFocus,
    answers.diet,
    answers.ageBracket,
    answers.exactAge,
    answers.gender,
  ])
}
