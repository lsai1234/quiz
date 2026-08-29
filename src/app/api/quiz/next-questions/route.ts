import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import {
  buildSteerPrompt, STEER_JSON_SCHEMA, STEER_SYSTEM_PROMPT, type SteerRequest,
} from '@/lib/quiz-v2/ai'

/**
 * The AI steer.
 *
 * Takes the shortlist the planner already produced and asks the model to order
 * it for this person. Returns raw model output — validation against the
 * candidate set happens on the client, in `parseSteerResult`, because the
 * client is the only side that knows which questions are still eligible by the
 * time the reply lands.
 *
 * ── Why this route is allowed to be slow ────────────────────────────────────
 * Because nothing waits for it. The caller has already rendered the next
 * question from the planner and aborts this request at 2.5s. A timeout here
 * costs a slightly less well-ordered question and nothing else, which is why
 * every failure path returns a 200 with an empty body rather than an error the
 * client would have to handle.
 */

// Constructed lazily — the OpenAI SDK throws at construction with no key, which
// would break page-data collection at build time.
function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey }) : null
}

/** No key configured. Distinguished from a failure so the telemetry can tell
 *  "never switched on" from "tried and did not make it". */
const UNAVAILABLE = { unavailable: true }
const NOTHING = { order: [], copy: [], reflection: null }

export async function POST(req: Request) {
  let body: SteerRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(NOTHING)
  }

  if (!Array.isArray(body?.candidates) || body.candidates.length < 2) {
    return NextResponse.json(NOTHING)
  }

  const client = getClient()
  if (!client) return NextResponse.json(UNAVAILABLE)

  try {
    const completion = await client.chat.completions.create(
      {
        // gpt-4.1-mini: strong instruction-following, fast, non-reasoning. The
        // job is to rank ten short strings, which is not work that wants a
        // bigger model — and this call lives inside a 2.5s budget.
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: STEER_SYSTEM_PROMPT },
          { role: 'user', content: buildSteerPrompt(body) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'quiz_steer',
            strict: true,
            schema: STEER_JSON_SCHEMA as unknown as Record<string, unknown>,
          },
        },
        max_tokens: 500,
        temperature: 0.4,
      },
      // Under the client's own 2.5s abort, so the model is given up on before
      // the browser gives up on us.
      { timeout: 2200 },
    )

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) return NextResponse.json(NOTHING)
    return NextResponse.json(JSON.parse(raw))
  } catch (err) {
    console.error('[quiz-steer]', err)
    return NextResponse.json(NOTHING)
  }
}
