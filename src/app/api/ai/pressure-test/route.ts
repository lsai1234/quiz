import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No OpenAI key' }, { status: 500 })

  const { idea, settings } = await req.json()
  const client = new OpenAI({ apiKey })

  const completion = await client.chat.completions.create({
    model: settings.openAIModel || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a brutal, honest TikTok content strategist for CHRGD, a premium UK gym/supplement brand.
Brand voice: ${settings.brandVoice}
Target audience: ${settings.targetAudience}
Score content ideas ruthlessly. A score of 70 means "needs work". 90+ means "queue immediately".`,
      },
      {
        role: 'user',
        content: `Score this TikTok carousel idea for CHRGD:

Title: ${idea.title}
Hook: ${idea.hook}
Target viewer: ${idea.target_viewer}
Pain point: ${idea.pain_point}
Core tension: ${idea.core_tension}
Category: ${idea.content_category}
Interaction goal: ${idea.interaction_goal}
Claim risk: ${idea.claim_risk_initial}

Return a JSON object with these exact fields (all scores 0-100):
{
  "overall": number,
  "hook_strength": number,
  "relatability": number,
  "curiosity_gap": number,
  "comment_potential": number,
  "share_potential": number,
  "save_potential": number,
  "visual_potential": number,
  "brand_fit": number,
  "claim_safety": number,
  "pipeline_readiness": number,
  "strengths": [3 specific strengths as strings],
  "weaknesses": [2-3 specific weaknesses as strings],
  "improvements": [3 specific actionable improvements as strings]
}`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  try {
    const data = JSON.parse(completion.choices[0].message.content ?? '{}')
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to parse response' }, { status: 500 })
  }
}
