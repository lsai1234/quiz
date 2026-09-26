import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { GLOSSARY, type GlossaryKey } from '@/lib/consult/glossary'
import { COPY_MODEL } from '@/lib/consult/ai/copy'
import { cleanText, looksMedical, rateLimiter } from '@/lib/consult/ai/guard'
import { EXPLAIN_SCHEMA, EXPLAIN_SYSTEM_PROMPT, buildExplainPrompt, validateExplain } from '@/lib/consult/ai/explain'

/**
 * POST /api/consult/explain — a follow-up question on a "What's this?" term
 * (build V7). Answered only from that term's approved text; a medical
 * question is redirected before any model sees it. The circuit check's entry
 * never takes questions.
 */

export const dynamic = 'force-dynamic'

const overLimit = rateLimiter(30, 60_000)

export async function POST(req: Request) {
  if (overLimit()) return NextResponse.json({ answer: null }, { status: 429 })
  let body: { key?: unknown; question?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ answer: null })
  }
  const key = typeof body.key === 'string' && body.key in GLOSSARY ? (body.key as GlossaryKey) : null
  if (!key || key === 'circuit-check') return NextResponse.json({ answer: null })
  const question = typeof body.question === 'string' ? cleanText(body.question) : ''
  if (!question) return NextResponse.json({ answer: null })
  if (looksMedical(question)) return NextResponse.json({ medical: true })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ answer: null, unavailable: true })
  try {
    const completion = await new OpenAI({ apiKey }).chat.completions.create(
      {
        model: COPY_MODEL,
        messages: [
          { role: 'system', content: EXPLAIN_SYSTEM_PROMPT },
          { role: 'user', content: buildExplainPrompt(GLOSSARY[key], question) },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'amp_explain', strict: true, schema: EXPLAIN_SCHEMA as unknown as Record<string, unknown> } },
        max_tokens: 200,
        temperature: 0.2,
      },
      { timeout: 2500, maxRetries: 0 },
    )
    const raw = completion.choices[0]?.message?.content?.trim()
    return NextResponse.json({ answer: raw ? validateExplain(JSON.parse(raw)) : null })
  } catch {
    return NextResponse.json({ answer: null })
  }
}
