import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No OpenAI key' }, { status: 500 })

  const { input, chip, settings } = await req.json()

  const client = new OpenAI({ apiKey })

  const systemPrompt = `You are a TikTok content strategist for CHRGD, a premium UK gym/supplement brand targeting 18-30 year olds.
Brand voice: ${settings.brandVoice}
Target audience: ${settings.targetAudience}
Generate 5-10 TikTok carousel ideas. Return only valid JSON array.`

  const userPrompt = chip
    ? `Generate carousel ideas with the angle: "${chip}"${input ? `. Additional context: ${input}` : ''}`
    : `Generate carousel ideas about: ${input}`

  const completion = await client.chat.completions.create({
    model: settings.openAIModel || 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${userPrompt}\n\nReturn a JSON object with a single key "ideas" whose value is an array of objects. Each object must have: id, title, hook, target_viewer, pain_point, core_tension, content_category, post_type, interaction_goal, visual_potential, claim_risk_initial (low/medium/high), initial_score (0-100).` },
    ],
    response_format: { type: 'json_object' },
  })

  try {
    const data = JSON.parse(completion.choices[0].message.content ?? '{}')
    const ideas = Array.isArray(data) ? data : data.ideas ?? []
    return NextResponse.json({ ideas })
  } catch {
    return NextResponse.json({ ideas: [] }, { status: 200 })
  }
}
