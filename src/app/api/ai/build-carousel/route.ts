import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { EXPERIENCE_TYPES } from '@/lib/mock-data'

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No OpenAI key' }, { status: 500 })

  const { idea, settings, experienceType } = await req.json()
  const client = new OpenAI({ apiKey })

  const expConfig = EXPERIENCE_TYPES.find((e) => e.type === experienceType)

  const experienceContext = expConfig
    ? `
Experience type: ${expConfig.label} ${expConfig.emoji}
Mechanism: "${expConfig.mechanism}"
The 5 slide roles must be (in order):
1. ${expConfig.slideRoles[0]}
2. ${expConfig.slideRoles[1]}
3. ${expConfig.slideRoles[2]}
4. ${expConfig.slideRoles[3]}
5. ${expConfig.slideRoles[4]}
Example hook for reference: "${expConfig.example}"`
    : 'Use a compelling 5-slide story arc: hook → problem → mechanism → takeaway → CTA.'

  const completion = await client.chat.completions.create({
    model: settings.openAIModel || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a senior TikTok content creator for CHRGD, a premium UK gym/supplement brand.
Brand voice: ${settings.brandVoice}
Target audience: ${settings.targetAudience}
Banned phrases: ${settings.bannedPhrases?.join(', ')}
Visual guidance: ${settings.visualStyleGuidance}

You create carousel slides that stop scrolls and make people swipe every time.
Each slide must be punchy, specific, and serve the psychological experience being created.
Never be generic. Every line earns its place.`,
      },
      {
        role: 'user',
        content: `Build a 5-slide TikTok carousel for CHRGD.

Idea: ${idea.title}
Hook: ${idea.hook}
Target viewer: ${idea.target_viewer}
Pain point: ${idea.pain_point}
Core tension: ${idea.core_tension}
${experienceContext}

Return a JSON array of exactly 5 slide objects. Each object must have:
{
  "slide_number": 1-5,
  "role": "the role name from above",
  "text": "the actual slide copy — punchy, specific, no filler. Use line breaks for rhythm.",
  "visual_note": "precise visual direction for the image generator — describe what should be in frame, mood, lighting, what makes it scroll-stop worthy",
  "text_position": "top" | "middle" | "bottom"
}

Rules:
- Slide 1 text must create irresistible curiosity — make them NEED to swipe
- Slide 5 must have a strong comment or save CTA
- Be specific: use real numbers, real scenarios, real tensions
- Write how the audience talks, not how brands talk
- Every slide should feel like it could stand alone but is stronger in sequence`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  try {
    const raw = completion.choices[0].message.content ?? '{}'
    const data = JSON.parse(raw)
    const slides = Array.isArray(data) ? data : data.slides ?? []
    return NextResponse.json(slides)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
