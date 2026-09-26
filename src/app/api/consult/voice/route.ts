import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { cleanText, looksMedical, MAX_TEXT, rateLimiter } from '@/lib/consult/ai/guard'
import { MAX_AUDIO_BYTES, VOICE_MODEL, VOICE_PROMPT, isAudioType } from '@/lib/consult/ai/voice'

/**
 * POST /api/consult/voice — speech to text for "Tell Amp more" (build U3).
 *
 *   multipart { audio: Blob }  →  { text } | { held: 'medical' } | { fallback } | { unavailable }
 *
 * The clip is type- and size-checked, sent once, and never stored or logged.
 * The transcript is screened like typed text; a medical one is withheld.
 */

export const dynamic = 'force-dynamic'

const overLimit = rateLimiter(10, 60_000)

export async function POST(req: Request) {
  if (overLimit()) return NextResponse.json({ fallback: true }, { status: 429 })
  let audio: FormDataEntryValue | null
  try {
    audio = (await req.formData()).get('audio')
  } catch {
    return NextResponse.json({ fallback: true })
  }
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES || !isAudioType(audio.type)) {
    return NextResponse.json({ fallback: true, reason: 'audio' })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ unavailable: true })

  try {
    const ext = audio.type.includes('mp4') || audio.type.includes('m4a') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : audio.type.includes('mpeg') ? 'mp3' : audio.type.includes('wav') ? 'wav' : 'webm'
    const file = new File([audio], `clip.${ext}`, { type: audio.type })
    const result = await new OpenAI({ apiKey }).audio.transcriptions.create(
      { file, model: VOICE_MODEL, language: 'en', prompt: VOICE_PROMPT, response_format: 'json' },
      { timeout: 12_000, maxRetries: 0 },
    )
    const text = cleanText(result.text ?? '').slice(0, MAX_TEXT)
    if (!text) return NextResponse.json({ text: '' })
    if (looksMedical(text)) return NextResponse.json({ held: 'medical' })
    return NextResponse.json({ text })
  } catch (err) {
    // The error's name only: never the audio or what was said.
    console.error('[consult-voice]', err instanceof Error ? err.name : 'error')
    return NextResponse.json({ fallback: true })
  }
}
