import { NextResponse } from 'next/server'
import { auditRoute } from '@/lib/consult/ai/auditRoute'
import OpenAI from 'openai'
import { SCENES, resolveSceneDef } from '@/lib/consult/flow'
import {
  COPY_BUDGET_MS,
  COPY_MODEL,
  COPY_SYSTEM_PROMPT,
  NEVER_AI,
  REACT_SAFE,
  buildCopyPrompt,
  copySchema,
  validateSceneCopy,
} from '@/lib/consult/ai/copy'
import { EMPTY_ANSWERS, type ConsultAnswers, type SceneId } from '@/lib/consult/types'
import { rateLimiter } from '@/lib/consult/ai/guard'

const overLimit = rateLimiter(120, 60_000)

/**
 * POST /api/consult/copy — Amp's words for one scene (builds V1, V2).
 *
 * Structured outputs from a pinned model, with the key on the server. The
 * body names the scene and carries the answers so far; the route resolves the
 * scene itself (so a client can't ask it to word something that doesn't
 * exist), prompts with a coarse summary that never includes health answers,
 * and validates the reply against the scene's schema before it goes back.
 *
 * Every failure is a 200 with `{ fallback: true }`: the client's answer to a
 * failure is always the same — keep the scripted copy — so there is nothing
 * for it to handle. No key is `{ unavailable: true }`, so the telemetry can
 * tell "never switched on" from "tried and missed".
 *
 * The server's own budget sits under the client's, so the model is given up
 * on before the browser gives up on us.
 */

export const dynamic = 'force-dynamic'

const SERVER_BUDGET_MS = COPY_BUDGET_MS - 300
const FALLBACK = { fallback: true }
const UNAVAILABLE = { unavailable: true }

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey }) : null
}

const KNOWN_SCENES = new Set<string>(SCENES.map((s) => s.id))

/** Only the answer fields the summary reads, re-typed. Anything else is dropped. */
function answersFrom(raw: unknown): ConsultAnswers {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ConsultAnswers>
  return {
    ...EMPTY_ANSWERS,
    goals: Array.isArray(r.goals) ? r.goals.filter((g) => typeof g === 'string').slice(0, 3) : [],
    age: typeof r.age === 'string' ? r.age : null,
    week: Array.isArray(r.week) && r.week.length === 7 ? r.week : null,
    energy: typeof r.energy === 'number' ? r.energy : null,
    sleep: r.sleep && typeof r.sleep === 'object' ? r.sleep : null,
    caffeine: r.caffeine && typeof r.caffeine === 'object' ? r.caffeine : null,
    comfort: r.comfort === true,
    daylight: typeof r.daylight === 'string' ? r.daylight : null,
    route: r.route === 'speed' ? 'speed' : 'deep',
  } as ConsultAnswers
}

async function handle(req: Request) {
  if (overLimit()) return NextResponse.json(FALLBACK, { status: 429 })
  let body: { sceneId?: unknown; answers?: unknown; previous?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(FALLBACK)
  }
  const sceneId = typeof body.sceneId === 'string' ? body.sceneId : ''
  if (!KNOWN_SCENES.has(sceneId) || NEVER_AI.includes(sceneId as SceneId)) return NextResponse.json(FALLBACK)

  const client = getClient()
  if (!client) return NextResponse.json(UNAVAILABLE)

  const answers = answersFrom(body.answers)
  const scene = resolveSceneDef(sceneId as SceneId, answers)
  const previous = typeof body.previous === 'string' && REACT_SAFE.includes(body.previous as SceneId) ? (body.previous as SceneId) : null

  try {
    const completion = await client.chat.completions.create(
      {
        model: COPY_MODEL,
        messages: [
          { role: 'system', content: COPY_SYSTEM_PROMPT },
          { role: 'user', content: buildCopyPrompt(scene, answers, previous) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'amp_scene_copy', strict: true, schema: copySchema(scene, Boolean(previous)) },
        },
        max_tokens: 300,
        temperature: 0.6,
      },
      { timeout: SERVER_BUDGET_MS, maxRetries: 0 },
    )
    const raw = completion.choices[0]?.message?.content?.trim()
    const copy = raw ? validateSceneCopy(JSON.parse(raw), scene) : null
    return NextResponse.json(copy ? { copy } : FALLBACK)
  } catch (err) {
    console.error('[consult-copy]', err instanceof Error ? err.message : err)
    return NextResponse.json(FALLBACK)
  }
}

export const POST = auditRoute('copy', COPY_MODEL, handle)
