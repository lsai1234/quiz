import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No OpenAI key' }, { status: 500 })

  const { slides, idea, settings } = await req.json()
  const client = new OpenAI({ apiKey })

  const allText = slides
    .map((s: { slide_number: number; text: string }) => `Slide ${s.slide_number}: ${s.text}`)
    .join('\n\n')

  const completion = await client.chat.completions.create({
    model: settings.openAIModel || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a compliance reviewer for CHRGD, a UK gym/supplement brand.
Claim safety rules: ${settings.claimSafetyRules}
Banned phrases: ${settings.bannedPhrases?.join(', ')}

Flag content that could be considered medical claims, guaranteed outcomes, or misleading health claims under UK ASA/CAP rules.
Be specific — quote the exact phrases that are risky and explain why.`,
      },
      {
        role: 'user',
        content: `Review this TikTok carousel for claim safety.

Idea: ${idea.title}
Category: ${idea.content_category}

Full slide text:
${allText}

Return a JSON object:
{
  "claim_risk": "low" | "medium" | "high",
  "claim_safety_notes": "overall assessment — 1-2 sentences about the risk level and what to watch",
  "risky_phrases": [
    {
      "phrase": "exact quoted phrase from the slides",
      "issue": "why this is risky",
      "safer_rewrite": "a safer alternative that keeps the same meaning"
    }
  ]
}

claim_risk: low = no issues, medium = 1-2 phrases to soften, high = significant claims that must be changed before publishing`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  try {
    const data = JSON.parse(completion.choices[0].message.content ?? '{}')
    return NextResponse.json({ ...data, overridden: false })
  } catch {
    return NextResponse.json({ error: 'Failed to parse response' }, { status: 500 })
  }
}
