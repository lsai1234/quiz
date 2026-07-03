import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { QuizAnswers } from '@/lib/types'
import {
  buildQuestionsPrompt,
  parseQuestionsResult,
  QUESTIONS_SYSTEM_PROMPT,
  QUESTIONS_JSON_SCHEMA,
  type DynamicQuestion,
} from '@/lib/ai-questions'

// Constructed lazily inside the handler — the OpenAI SDK throws at construction
// when no key is set, which would break the build/page-data collection.
function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey }) : null
}

interface GenerateQuestionsResponse {
  questions: DynamicQuestion[]
  generated: boolean
}

const EMPTY: GenerateQuestionsResponse = { questions: [], generated: false }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const answers: QuizAnswers | undefined = body.answers

  const client = getClient()
  if (!answers || !Array.isArray(answers.goals) || answers.goals.length === 0 || !client) {
    return NextResponse.json(EMPTY)
  }

  try {
    const prompt = buildQuestionsPrompt(answers)

    const completion = await client.chat.completions.create(
      {
        // gpt-4.1-mini: strong instruction-following, fast and non-reasoning —
        // this call is prefetched mid-quiz and must be ready within a step or
        // two. Strict structured outputs guarantee the question shape parses.
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: QUESTIONS_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'deep_dive_questions',
            strict: true,
            schema: QUESTIONS_JSON_SCHEMA as unknown as Record<string, unknown>,
          },
        },
        max_tokens: 900,
        temperature: 0.6,
      },
      { timeout: 10000 },
    )

    const rawContent = completion.choices[0]?.message?.content?.trim() ?? ''
    const questions = parseQuestionsResult(JSON.parse(rawContent))
    if (!questions) return NextResponse.json(EMPTY)

    return NextResponse.json({ questions, generated: true } satisfies GenerateQuestionsResponse)
  } catch (err) {
    console.error('[generate-questions]', err)
    return NextResponse.json(EMPTY)
  }
}
