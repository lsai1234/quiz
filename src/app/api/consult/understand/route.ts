import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { SCENES, resolveSceneDef } from '@/lib/consult/flow'
import { COPY_MODEL, NEVER_AI } from '@/lib/consult/ai/copy'
import { MAX_TEXT, cleanText, looksMedical, rateLimiter } from '@/lib/consult/ai/guard'
import { UNDERSTAND_SCHEMA, UNDERSTAND_SYSTEM_PROMPT, buildUnderstandPrompt, validatePicks } from '@/lib/consult/ai/understand'
import { EMPTY_ANSWERS, type SceneId } from '@/lib/consult/types'

/**
 * POST /api/consult/understand — "Tell Amp more" (builds V3, V5).
 *
 * Free text in; picks to confirm out. Every guard runs again here, because the
 * browser's checks are a courtesy, not a control:
 *
 *   1. rate limit and length cap
 *   2. the medical screen — health text is refused before it goes anywhere
 *   3. moderation
 *   4. a narrow prompt where the text is data, with a strict schema
 *   5. `validatePicks`: known kinds and values only, clean labels, at most four
 *
 * The text is never stored and never logged.
 */

export const dynamic = 'force-dynamic'

const BUDGET_MS = 2500
const overLimit = rateLimiter(30, 60_000)
const KNOWN = new Set<string>(SCENES.map((s) => s.id))

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey }) : null
}

export async function POST(req: Request) {
  if (overLimit()) return NextResponse.json({ held: 'busy' }, { status: 429 })
  let body: { sceneId?: unknown; text?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ fallback: true })
  }
  const sceneId = typeof body.sceneId === 'string' ? body.sceneId : ''
  if (!KNOWN.has(sceneId) || NEVER_AI.includes(sceneId as SceneId)) return NextResponse.json({ fallback: true })
  if (typeof body.text !== 'string' || body.text.length > MAX_TEXT * 2) return NextResponse.json({ held: 'too-long' })
  const text = cleanText(body.text)
  if (!text) return NextResponse.json({ picks: [] })
  if (looksMedical(text)) return NextResponse.json({ held: 'medical' })

  const client = getClient()
  if (!client) return NextResponse.json({ unavailable: true })

  try {
    const mod = await client.moderations.create({ model: 'omni-moderation-latest', input: text }, { timeout: 1200, maxRetries: 0 })
    if (mod.results?.some((r) => r.flagged)) return NextResponse.json({ held: 'moderated' })

    const scene = resolveSceneDef(sceneId as SceneId, EMPTY_ANSWERS)
    const completion = await client.chat.completions.create(
      {
        model: COPY_MODEL,
        messages: [
          { role: 'system', content: UNDERSTAND_SYSTEM_PROMPT },
          { role: 'user', content: buildUnderstandPrompt(scene, text) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'amp_picks', strict: true, schema: UNDERSTAND_SCHEMA as unknown as Record<string, unknown> },
        },
        max_tokens: 300,
        temperature: 0.2,
      },
      { timeout: BUDGET_MS, maxRetries: 0 },
    )
    const raw = completion.choices[0]?.message?.content?.trim()
    return NextResponse.json({ picks: raw ? validatePicks(JSON.parse(raw)) : [] })
  } catch (err) {
    // The error, never the text.
    console.error('[consult-understand]', err instanceof Error ? err.name : 'error')
    return NextResponse.json({ fallback: true })
  }
}
