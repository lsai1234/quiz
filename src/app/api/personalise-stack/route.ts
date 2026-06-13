import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { QuizAnswers } from '@/lib/types'
import {
  buildBlueprintPrompt,
  parseBlueprintResult,
  BLUEPRINT_SYSTEM_PROMPT,
  type SlotOption,
} from '@/lib/ai-stack'

// Constructed lazily inside the handler — the OpenAI SDK throws at construction
// when no key is set, which would break the build/page-data collection.
function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey }) : null
}

interface PersonaliseResponse {
  choices: Record<string, string>
  reasons: Record<string, string>
  personalised: boolean
}

const EMPTY: PersonaliseResponse = { choices: {}, reasons: {}, personalised: false }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const answers: QuizAnswers = body.answers
  const slots: SlotOption[] = Array.isArray(body.slots) ? body.slots : []

  const client = getClient()
  if (!answers || slots.length === 0 || !client) {
    return NextResponse.json(EMPTY)
  }

  try {
    const prompt = buildBlueprintPrompt(answers, slots)

    const completion = await client.chat.completions.create(
      {
        // gpt-4.1-mini: strong instruction-following + JSON adherence, fast and
        // non-reasoning (keeps the reveal snappy), ~$0.001/quiz at this size.
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: BLUEPRINT_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 700,
        temperature: 0.3,
      },
      { timeout: 9000 },
    )

    const rawContent = completion.choices[0]?.message?.content?.trim() ?? ''
    const optionIdsBySlot: Record<string, Set<string>> = {}
    for (const s of slots) optionIdsBySlot[s.slotId] = new Set(s.options.map(o => o.id))

    const parsed = parseBlueprintResult(JSON.parse(rawContent), optionIdsBySlot)
    if (!parsed) return NextResponse.json(EMPTY)

    const response: PersonaliseResponse = { ...parsed, personalised: true }
    return NextResponse.json(response)
  } catch (err) {
    console.error('[personalise-stack]', err)
    return NextResponse.json(EMPTY)
  }
}
