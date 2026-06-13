import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { QuizAnswers, Product, RecommendedStack } from '@/lib/types'
import { MOCK_PRODUCTS, buildRecommendedStack, buildStackFromAIOrder, getEligibleCandidates } from '@/lib/recommendation'
import { buildRankingPrompt, parseAIStackResult, RANKING_SYSTEM_PROMPT } from '@/lib/ai-stack'

// Constructed lazily inside the handler — the OpenAI SDK throws at construction
// when no key is set, which would break the build/page-data collection.
function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey }) : null
}

interface RecommendStackResponse extends RecommendedStack {
  /** Personalised, AI-written reason per product id (empty when deterministic). */
  aiReasons: Record<string, string>
  /** True when the selection was ranked by the AI, false when it fell back. */
  personalised: boolean
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const answers: QuizAnswers = body.answers ?? body
  const catalogue: Product[] = Array.isArray(body.catalogue) && body.catalogue.length > 0
    ? body.catalogue
    : (MOCK_PRODUCTS as Product[])

  // Deterministic fallback — always valid, used if anything below fails.
  const fallback = (): RecommendStackResponse => ({
    ...buildRecommendedStack(answers, catalogue),
    aiReasons: {},
    personalised: false,
  })

  try {
    const client = getClient()
    const eligible = getEligibleCandidates(answers, catalogue)
    // Nothing to rank, or no key configured — skip the model entirely.
    if (eligible.length === 0 || !client) {
      return NextResponse.json(fallback())
    }

    const prompt = buildRankingPrompt(answers, eligible.map(e => e.product))

    const completion = await client.chat.completions.create(
      {
        // gpt-4.1-mini: strong instruction-following + JSON adherence, fast and
        // non-reasoning (keeps the reveal snappy), ~$0.001/quiz at this size.
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: RANKING_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 600,
        temperature: 0.3,
      },
      { timeout: 9000 },
    )

    const rawContent = completion.choices[0]?.message?.content?.trim() ?? ''
    const parsed = parseAIStackResult(JSON.parse(rawContent), new Set(eligible.map(e => e.product.id)))
    if (!parsed) return NextResponse.json(fallback())

    // Re-assert every hard constraint server-side regardless of what the AI said.
    const stack = buildStackFromAIOrder(answers, catalogue, parsed.order)

    const response: RecommendStackResponse = {
      ...stack,
      aiReasons: parsed.reasons,
      personalised: true,
    }
    return NextResponse.json(response)
  } catch (err) {
    console.error('[recommend-stack]', err)
    return NextResponse.json(fallback())
  }
}
