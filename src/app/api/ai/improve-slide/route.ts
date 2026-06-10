import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No OpenAI key' }, { status: 500 })

  const { slide, action, idea, settings } = await req.json()
  const client = new OpenAI({ apiKey })

  const actionInstructions: Record<string, string> = {
    'Make punchier': 'Cut every word that does not pull weight. Shorter sentences. Harder impact. No soft language.',
    'Less wordy': 'Halve the word count. Keep only the essentials. White space is power.',
    'More TikTok-native': 'Write how the audience actually talks. Conversational, direct, no brand-speak. Could be a DM from a knowledgeable friend.',
    'Make safer': 'Remove or soften any claims that could be flagged as medical or guaranteed outcomes. Keep the core point, just protect the brand.',
    'Regenerate': 'Rewrite this slide completely. Same role and purpose, fresh angle and execution.',
  }

  const instruction = actionInstructions[action] ?? `Apply this improvement: ${action}`

  const completion = await client.chat.completions.create({
    model: settings.openAIModel || 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a TikTok content creator for CHRGD, a UK gym/supplement brand.
Brand voice: ${settings.brandVoice}
Banned phrases: ${settings.bannedPhrases?.join(', ')}`,
      },
      {
        role: 'user',
        content: `Improve slide ${slide.slide_number} of a TikTok carousel about "${idea.title}".

Current slide:
Role: ${slide.role}
Text: ${slide.text}
Visual note: ${slide.visual_note}
Text position: ${slide.text_position}

Improvement needed: ${instruction}

Return a JSON object with the same fields (slide_number, role, text, visual_note, text_position). Keep slide_number and role unchanged. Only update text and/or visual_note.`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  try {
    const data = JSON.parse(completion.choices[0].message.content ?? '{}')
    return NextResponse.json({ ...slide, ...data, slide_number: slide.slide_number, role: slide.role })
  } catch {
    return NextResponse.json(slide)
  }
}
