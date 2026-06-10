import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No OpenAI key' }, { status: 500 })

  const { slides, idea, settings } = await req.json()
  const client = new OpenAI({ apiKey })

  const slideSummary = slides
    .map((s: { slide_number: number; role: string; visual_note: string }) =>
      `Slide ${s.slide_number} (${s.role}) visual note: ${s.visual_note}`)
    .join('\n')

  const completion = await client.chat.completions.create({
    model: settings.openAIModel || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a visual director for CHRGD's TikTok content.
Visual guidance: ${settings.visualStyleGuidance}
The brand uses dark backgrounds, CHRGD orange/yellow accents, editorial and premium gym aesthetic.
Content is optimised for TikTok's 9:16 format with UI elements at top (notifications, time) and bottom (nav bar, like buttons).`,
      },
      {
        role: 'user',
        content: `Create visual direction for this TikTok carousel.

Idea: ${idea.title}
Hook: ${idea.hook}
Visual potential: ${idea.visual_potential}

Slide visual notes:
${slideSummary}

Return a JSON object:
{
  "visual_style_hint": "overall visual direction for the whole carousel — lighting, mood, colour palette, composition style, what makes it scroll-stop worthy. Be specific and creative.",
  "ai_visual_priority": "low" | "medium" | "high",
  "safe_zone_priority": "low" | "medium" | "high",
  "preferred_text_position": "bottom" | "middle" | "top" | "varies",
  "text_density": "low" | "medium" | "high",
  "layout_risk": "low" | "medium" | "high",
  "platform_ui_risk": "low" | "medium" | "high",
  "double_take_detail": "one specific visual detail that creates a double-take moment — something the viewer has to look twice to notice"
}

ai_visual_priority: how important it is to get the AI image exactly right (high = single product shot matters, low = text-on-dark-bg is fine)
safe_zone_priority: how critical it is to keep content away from TikTok UI (high = key elements near edges)
layout_risk: how risky the proposed layout is for readability (high = lots going on)
platform_ui_risk: risk of content being obscured by TikTok's interface elements`,
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
