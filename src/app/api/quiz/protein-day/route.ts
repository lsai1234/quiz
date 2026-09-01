import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import {
  MAX_DAY_TEXT, PROTEIN_DAY_JSON_SCHEMA, PROTEIN_DAY_SYSTEM_PROMPT,
  buildProteinDayPrompt, readProteinDay, type ProteinDayRequest,
} from '@/lib/quiz-v2/protein-ai'
import { MEALS } from '@/lib/quiz-v2/protein'

/**
 * "Just tell us what you eat" — reading a typed day into the four meals.
 *
 * Returns raw picks; validation against the option set happens on the client in
 * `parseProteinDayResult`, same split as the steer route, because the client is
 * the side holding the bank.
 *
 * ── Why this one is allowed to have no key ──────────────────────────────────
 * Unlike the steer, somebody is WAITING for this: they typed a sentence and
 * pressed a button. "Nothing happened" is not an acceptable answer, and neither
 * is a door that only works in production. So a miss falls through to
 * `readProteinDay`, the deterministic word-list reader, which is what runs on
 * every local machine and in the whole e2e suite. The route therefore always
 * returns picks or an explicit null, never an error the UI has to invent copy
 * for.
 *
 * ── What is sent ────────────────────────────────────────────────────────────
 * One sentence about food, and the option labels. No name, no age, no weight,
 * no goals, no safety flags, and nothing the module later compares it against —
 * the target is computed on the client and never leaves it. This is the only
 * place in the quiz that sends a member's own words anywhere, which is why the
 * screen says so before they type.
 */

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey }) : null
}

/** How the answer was reached, so the funnel can tell the two readers apart. */
type Source = 'model' | 'local'

const NOTHING = { picks: null, source: 'local' as Source }

export async function POST(req: Request) {
  let body: ProteinDayRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(NOTHING)
  }

  const text = typeof body?.text === 'string' ? body.text.slice(0, MAX_DAY_TEXT).trim() : ''
  const options = Array.isArray(body?.options)
    ? body.options.filter(
        (o) =>
          o && typeof o.id === 'string' && typeof o.label === 'string' &&
          (MEALS as readonly string[]).includes(o.meal),
      )
    : []

  if (text.length < 3 || options.length === 0) return NextResponse.json(NOTHING)

  const local = () =>
    NextResponse.json({ picks: readProteinDay(text, options), source: 'local' as Source })

  const client = getClient()
  if (!client) return local()

  try {
    const completion = await client.chat.completions.create(
      {
        // Four classifications against a fixed menu. A bigger model would be
        // slower and no better at deciding whether a bap is a sandwich.
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: PROTEIN_DAY_SYSTEM_PROMPT },
          { role: 'user', content: buildProteinDayPrompt({ text, options }) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'protein_day',
            strict: true,
            schema: PROTEIN_DAY_JSON_SCHEMA as unknown as Record<string, unknown>,
          },
        },
        max_tokens: 120,
        // Zero: this is a classification, and two members typing the same
        // sentence should get the same reading.
        temperature: 0,
      },
      { timeout: 6000 },
    )

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) return local()
    return NextResponse.json({ picks: JSON.parse(raw), source: 'model' as Source })
  } catch (err) {
    console.error('[protein-day]', err)
    // The member is waiting. A worse reading beats no reading.
    return local()
  }
}
