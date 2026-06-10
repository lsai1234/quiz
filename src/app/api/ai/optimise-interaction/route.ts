import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No OpenAI key' }, { status: 500 })

  const { slides, goal, idea, settings } = await req.json()
  const client = new OpenAI({ apiKey })

  const goalDescriptions: Record<string, string> = {
    comments: 'Drive comments — create a reason to reply, debate, confess, or share a number',
    shares: 'Drive shares — make this feel like something people send to a friend who needs to see it',
    saves: 'Drive saves — this should feel like a reference card people will come back to',
    tags: 'Drive tags — create a relatable moment that makes people think of a specific friend',
    follows: 'Drive follows — position CHRGD as the go-to source for this type of content',
    debate: 'Start a debate — take a clear side, invite pushback, make fence-sitting impossible',
    relatability: 'Maximise relatability — make the exact target viewer feel seen and called out',
    'swipe-through': 'Maximise swipe-through rate — every slide must create a reason to see the next one',
  }

  const slideSummary = slides
    .map((s: { slide_number: number; role: string; text: string }) => `Slide ${s.slide_number} (${s.role}): ${s.text.slice(0, 100)}...`)
    .join('\n')

  const completion = await client.chat.completions.create({
    model: settings.openAIModel || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a TikTok interaction specialist for CHRGD, a UK gym/supplement brand.
Brand voice: ${settings.brandVoice}
Target audience: ${settings.targetAudience}`,
      },
      {
        role: 'user',
        content: `Optimise this carousel for the goal: ${goalDescriptions[goal] ?? goal}

Idea: ${idea.title}
Hook: ${idea.hook}

Current slides:
${slideSummary}

Return a JSON object:
{
  "goal": "${goal}",
  "slide_1_hook": "rewritten slide 1 text optimised specifically for this goal",
  "slide_5_cta": "rewritten slide 5 CTA optimised specifically for this goal",
  "caption_angle": "the caption hook — first line of the post caption, ~150 chars, no hashtags",
  "comment_trigger": "the specific question or prompt to paste at the end of the caption to drive the goal",
  "hashtags_hint": "8-12 relevant hashtags as a single string with spaces between them",
  "cta_warning": "optional — if the CTA has any risk or could feel spammy, note it here"
}`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  try {
    const data = JSON.parse(completion.choices[0].message.content ?? '{}')
    return NextResponse.json({ ...data, goal })
  } catch {
    return NextResponse.json({ error: 'Failed to parse response' }, { status: 500 })
  }
}
