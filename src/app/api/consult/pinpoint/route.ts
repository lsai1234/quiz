import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { auditRoute } from '@/lib/consult/ai/auditRoute'
import { COPY_BUDGET_MS, COPY_MODEL } from '@/lib/consult/ai/copy'
import { MAX_TEXT, cleanText, looksMedical, rateLimiter } from '@/lib/consult/ai/guard'
import {
  FOUND_SCHEMA,
  HUNCH_SCHEMA,
  PINPOINT_SYSTEM_PROMPT,
  TELL_SYSTEM_PROMPT,
  WORDED_FORMATS,
  buildFoundPrompt,
  buildHunchPrompt,
  buildProbePrompt,
  buildTellPrompt,
  cleanEvidence,
  pinpointContext,
  probeSchema,
  scriptedParts,
  tellSchema,
  tellableIds,
  validateFound,
  validateHunchLine,
  validateProbePicks,
  validateProbeWords,
} from '@/lib/consult/ai/pinpoint'
import { PATTERN_BY_ID, PROBE_BY_ID } from '@/lib/consult/pinpoint/library'
import { probeText } from '@/lib/consult/pinpoint/screen'
import type { PatternId } from '@/lib/consult/pinpoint/types'
import { AGE_LABEL, GOAL_LABEL } from '@/lib/consult/summary'
import { EMPTY_ANSWERS, type AgeBand, type ConsultAnswers, type ConsultGoal } from '@/lib/consult/types'

/**
 * POST /api/consult/pinpoint — Pinpoint's AI (plan v5 §7).
 *
 *   { kind: 'probe', probe, person }            → { words }
 *   { kind: 'hunch', pattern, evidence, person } → { line }
 *   { kind: 'found', pinpointed, partly, person } → { summary }
 *   { kind: 'tell', text, candidates, person }  → { picks }
 *
 * `person` is the coarse picture only: goals, age band, comfort, and the
 * afternoon energy one question's scripted words quote. The route resolves
 * every question and pattern from the library itself, so nothing a client
 * sends becomes words in a prompt except typed text, which is screened for
 * health details and moderated first, and is never stored or logged.
 *
 * Wording is cached here by its prompt: many people share the same coarse
 * picture, so the same question for the same kind of person is asked once.
 * Every failure is `{ fallback: true }`: the script stands.
 */

export const dynamic = 'force-dynamic'

const SERVER_BUDGET_MS = COPY_BUDGET_MS - 300
const TELL_BUDGET_MS = 8000
const FALLBACK = { fallback: true }
const overLimit = rateLimiter(120, 60_000)

/** Answers keyed by prompt. Per instance and small: a spend saver, not a store. */
const CACHE = new Map<string, unknown>()
const CACHE_MAX = 500
function remember(key: string, value: unknown) {
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string)
  CACHE.set(key, value)
}

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey }) : null
}

/** The coarse person, re-typed. Anything else is dropped. */
function personFrom(raw: unknown): ConsultAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const goals = Array.isArray(r.goals) ? r.goals.filter((g): g is ConsultGoal => typeof g === 'string' && g in GOAL_LABEL).slice(0, 3) : []
  const age = typeof r.age === 'string' && r.age in AGE_LABEL ? (r.age as AgeBand) : null
  const energy = typeof r.energy === 'number' && Number.isInteger(r.energy) && r.energy >= 0 && r.energy <= 10 ? r.energy : null
  return { ...EMPTY_ANSWERS, goals, age, energy, comfort: r.comfort === true }
}

async function ask(client: OpenAI, name: string, schema: Record<string, unknown>, system: string, user: string, budget: number, temperature: number): Promise<unknown> {
  const completion = await client.chat.completions.create(
    {
      model: COPY_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
      max_tokens: 300,
      temperature,
    },
    { timeout: budget, maxRetries: 0 },
  )
  const raw = completion.choices[0]?.message?.content?.trim()
  return raw ? JSON.parse(raw) : null
}

async function handle(req: Request) {
  if (overLimit()) return NextResponse.json(FALLBACK, { status: 429 })
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(FALLBACK)
  }
  const person = personFrom(body.person)
  const context = pinpointContext(person)
  const kind = body.kind

  // Screened before the key is even looked at: health text goes nowhere.
  let text = ''
  if (kind === 'tell') {
    if (typeof body.text !== 'string' || body.text.length > MAX_TEXT * 2) return NextResponse.json({ held: 'too-long' })
    text = cleanText(body.text)
    if (!text) return NextResponse.json({ picks: [] })
    if (looksMedical(text)) return NextResponse.json({ held: 'medical' })
  }

  const client = getClient()
  if (!client) return NextResponse.json({ unavailable: true })

  try {
    switch (kind) {
      case 'probe': {
        const probe = typeof body.probe === 'string' ? PROBE_BY_ID[body.probe] : undefined
        if (!probe || !WORDED_FORMATS.has(probe.format)) return NextResponse.json(FALLBACK)
        const scripted = scriptedParts(probe, probeText(probe, person))
        const prompt = buildProbePrompt(probe, scripted, context)
        const key = `probe|${prompt}`
        if (CACHE.has(key)) return NextResponse.json({ words: CACHE.get(key) })
        const words = validateProbeWords(await ask(client, 'amp_pinpoint_probe', probeSchema(probe), PINPOINT_SYSTEM_PROMPT, prompt, SERVER_BUDGET_MS, 0.6), probe, scripted)
        if (!words) return NextResponse.json(FALLBACK)
        remember(key, words)
        return NextResponse.json({ words })
      }
      case 'hunch': {
        const pattern = typeof body.pattern === 'string' && body.pattern in PATTERN_BY_ID ? (body.pattern as PatternId) : null
        const evidence = cleanEvidence(body.evidence)
        if (!pattern || !evidence.length) return NextResponse.json(FALLBACK)
        const prompt = buildHunchPrompt(pattern, evidence, context)
        const key = `hunch|${prompt}`
        if (CACHE.has(key)) return NextResponse.json({ line: CACHE.get(key) })
        const line = validateHunchLine(await ask(client, 'amp_pinpoint_hunch', HUNCH_SCHEMA as unknown as Record<string, unknown>, PINPOINT_SYSTEM_PROMPT, prompt, SERVER_BUDGET_MS, 0.6), pattern, evidence)
        if (!line) return NextResponse.json(FALLBACK)
        remember(key, line)
        return NextResponse.json({ line })
      }
      case 'found': {
        const ids = (v: unknown) => (Array.isArray(v) ? v.filter((id): id is PatternId => typeof id === 'string' && id in PATTERN_BY_ID).slice(0, 3) : [])
        const pinpointed = ids(body.pinpointed)
        const partly = ids(body.partly).filter((id) => !pinpointed.includes(id))
        if (!pinpointed.length && !partly.length) return NextResponse.json(FALLBACK)
        const prompt = buildFoundPrompt(pinpointed, partly, context)
        const key = `found|${prompt}`
        if (CACHE.has(key)) return NextResponse.json({ summary: CACHE.get(key) })
        const summary = validateFound(await ask(client, 'amp_pinpoint_found', FOUND_SCHEMA as unknown as Record<string, unknown>, PINPOINT_SYSTEM_PROMPT, prompt, SERVER_BUDGET_MS, 0.6), [...pinpointed, ...partly])
        if (!summary) return NextResponse.json(FALLBACK)
        remember(key, summary)
        return NextResponse.json({ summary })
      }
      case 'tell': {
        const ids = tellableIds(body.candidates)
        if (!ids.length) return NextResponse.json({ picks: [] })
        const mod = await client.moderations.create({ model: 'omni-moderation-latest', input: text }, { timeout: 4000, maxRetries: 0 })
        if (mod.results?.some((r) => r.flagged)) return NextResponse.json({ held: 'moderated' })
        const raw = await ask(client, 'amp_pinpoint_tell', tellSchema(ids), TELL_SYSTEM_PROMPT, buildTellPrompt(ids, text, (p) => probeText(p, person)), TELL_BUDGET_MS, 0.2)
        return NextResponse.json({ picks: validateProbePicks(raw, ids) })
      }
      default:
        return NextResponse.json(FALLBACK)
    }
  } catch (err) {
    // The error, never the text.
    console.error('[consult-pinpoint]', err instanceof Error ? err.name : 'error')
    return NextResponse.json(FALLBACK)
  }
}

export const POST = auditRoute('pinpoint', COPY_MODEL, handle)
