import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No OpenAI key' }, { status: 500 })

  const { idea, action, settings } = await req.json()
  const client = new OpenAI({ apiKey })

  const completion = await client.chat.completions.create({
    model: settings.openAIModel || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a TikTok content strategist for CHRGD, a UK gym/supplement brand.
Brand voice: ${settings.brandVoice}
Target audience: ${settings.targetAudience}`,
      },
      {
        role: 'user',
        content: `Improve this content idea. Action: "${action}"

Current idea:
Title: ${idea.title}
Hook: ${idea.hook}
Target viewer: ${idea.target_viewer}
Pain point: ${idea.pain_point}
Core tension: ${idea.core_tension}

Return a JSON object with the same fields as the input (id, title, hook, target_viewer, pain_point, core_tension, content_category, post_type, interaction_goal, visual_potential, claim_risk_initial, initial_score). Keep the id unchanged. Improve the relevant fields based on the action.`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  try {
    const data = JSON.parse(completion.choices[0].message.content ?? '{}')
    return NextResponse.json({ ...idea, ...data, id: idea.id })
  } catch {
    return NextResponse.json(idea)
  }
}
