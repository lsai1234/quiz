/**
 * AI picks the exercises (server only).
 *
 * One call to OpenAI, on the same model and terms as the consult's copy:
 * nothing stored (`store: false`), a strict JSON schema, and an answer made
 * only of exercise ids and numbers. It writes no words a member reads.
 *
 * What it is sent: the setup's training days, length, focus, kit level,
 * experience and the days of their other activities, plus the frame
 * (`./validate`). Never their name, email, answers to the readiness check,
 * the areas they're working around (applied to the candidates before, and
 * checked after), or anything from the consult's health answers.
 *
 * Any failure (no key, slow, refused, off the frame) returns null and the
 * caller keeps the rules' week.
 */
import OpenAI from 'openai'
import { recordAi } from '@/lib/consult/ai/audit'
import { COPY_MODEL } from '@/lib/consult/ai/copy'
import { LIMITS } from './dose'
import { WEEKDAY_SHORT } from './copy'
import { aiFrame, checkAiAnswer, type FrameSession } from './validate'
import type { StrengthSession, TrainingPrefs, Weekday } from './types'

export const TRAINING_MODEL = COPY_MODEL
export const TRAINING_TIMEOUT_MS = 20_000
/** AI builds per member per day; past it, the rules build. */
export const AI_BUILDS_PER_DAY = 12

export const TRAINING_SYSTEM_PROMPT = [
  'You are a strength and conditioning coach choosing exercises for one person’s training week.',
  'For each session in the frame, choose exercises ONLY from that session’s candidate ids, and set sets, reps (low and high) and rest.',
  'Use about the given number of exercises (one more or one fewer is fine). Start with the bigger compound movements.',
  'Balance the week: avoid repeating the same exercise in back-to-back sessions, and keep hard leg work away from the day before a sport, run or hard class.',
  'Respect the limits given. For exercises counted in seconds, low and high are seconds.',
  'Return only the JSON asked for. Write no other text.',
].join(' ')

/** What the model sees: the setup in plain terms and the frame. Nothing personal. */
export function trainingUserPrompt(prefs: TrainingPrefs, frame: FrameSession[]): string {
  return JSON.stringify({
    focus: prefs.focus,
    experience: prefs.experience,
    minutesPerSession: prefs.minutes,
    kit: prefs.equipment,
    otherActivities: prefs.activities.map((a) => ({ day: WEEKDAY_SHORT[a.day], activity: a.kind, minutes: a.minutes })),
    limits: {
      sets: LIMITS.sets,
      reps: LIMITS.reps[prefs.focus],
      seconds: LIMITS.seconds,
      restSeconds: LIMITS.rest,
    },
    sessions: frame.map((f) => ({
      day: f.day,
      dayName: WEEKDAY_SHORT[f.day],
      template: f.template,
      exercises: f.count,
      candidates: f.candidates.map((c) => ({ id: c.id, movement: c.pattern, role: c.role, level: c.level, unit: c.unit, muscles: c.muscles })),
    })),
  })
}

/** Strict: ids and days are enums, so the model can't name anything outside the frame. */
export function trainingSchema(frame: FrameSession[]): Record<string, unknown> {
  const ids = [...new Set(frame.flatMap((f) => f.candidates.map((c) => c.id)))]
  return {
    type: 'object',
    additionalProperties: false,
    required: ['sessions'],
    properties: {
      sessions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['day', 'exercises'],
          properties: {
            day: { type: 'integer', enum: frame.map((f) => f.day) },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'sets', 'low', 'high', 'rest_seconds'],
                properties: {
                  id: { type: 'string', enum: ids },
                  sets: { type: 'integer' },
                  low: { type: 'integer' },
                  high: { type: 'integer' },
                  rest_seconds: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
  }
}

export interface AiResult {
  sessions: StrengthSession[]
}

/**
 * The week's training sessions from AI, or one day's; null to keep the rules'.
 * `create` is the OpenAI call, swappable in tests.
 */
export async function aiSessions(
  prefs: TrainingPrefs,
  seed: number,
  onlyDay?: Weekday,
  create?: (body: Record<string, unknown>) => Promise<string | null>,
): Promise<AiResult | null> {
  const apiKey = process.env.OPENAI_API_KEY
  const frame = aiFrame(prefs, seed, onlyDay)
  if (frame.length === 0 || frame.every((f) => f.candidates.length === 0)) return null
  if (!apiKey && !create) {
    void recordAi({ at: Date.now(), route: 'training', model: TRAINING_MODEL, ms: 0, outcome: 'unavailable' })
    return null
  }
  const t0 = Date.now()
  const body = {
    model: TRAINING_MODEL,
    store: false,
    messages: [
      { role: 'system', content: TRAINING_SYSTEM_PROMPT },
      { role: 'user', content: trainingUserPrompt(prefs, frame) },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'training_week', strict: true, schema: trainingSchema(frame) } },
    max_tokens: 2500,
    temperature: 0.3,
  }
  const subject = onlyDay === undefined ? 'week' : 'day'
  try {
    const raw = create
      ? await create(body)
      : ((
          await new OpenAI({ apiKey }).chat.completions.create({ ...(body as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming), store: false }, {
            timeout: TRAINING_TIMEOUT_MS,
            maxRetries: 0,
          })
        ).choices[0]?.message?.content?.trim() ?? null)
    if (!raw) {
      void recordAi({ at: t0, route: 'training', subject, model: TRAINING_MODEL, ms: Date.now() - t0, outcome: 'fallback', reason: 'empty' })
      return null
    }
    const verdict = checkAiAnswer(JSON.parse(raw), frame, prefs)
    if (!verdict.ok) {
      void recordAi({ at: t0, route: 'training', subject, model: TRAINING_MODEL, ms: Date.now() - t0, outcome: 'fallback', reason: verdict.reason })
      return null
    }
    void recordAi({ at: t0, route: 'training', subject, model: TRAINING_MODEL, ms: Date.now() - t0, outcome: 'ok' })
    return { sessions: verdict.sessions }
  } catch {
    void recordAi({ at: t0, route: 'training', subject, model: TRAINING_MODEL, ms: Date.now() - t0, outcome: 'error' })
    return null
  }
}
