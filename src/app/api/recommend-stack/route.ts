import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { QuizAnswers, Product, RecommendedStack } from '@/lib/types'
import { MOCK_PRODUCTS, buildRecommendedStack, buildStackFromAIOrder, getEligibleCandidates } from '@/lib/recommendation'
import { buildRankingPrompt, parseAIStackResult } from '@/lib/ai-stack'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
    const eligible = getEligibleCandidates(answers, catalogue)
    // Nothing to rank, or no key configured — skip the model entirely.
    if (eligible.length === 0 || !process.env.OPENAI_API_KEY) {
      return NextResponse.json(fallback())
    }

    const prompt = buildRankingPrompt(answers, eligible.map(e => e.product))

    const completion = await client.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 600,
        temperature: 0.4,
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
