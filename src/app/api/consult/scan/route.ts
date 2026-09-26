import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { COPY_MODEL } from '@/lib/consult/ai/copy'
import { rateLimiter } from '@/lib/consult/ai/guard'
import {
  SHELF_PROMPT,
  SHELF_SCHEMA,
  TRACKER_APPS,
  TRACKER_SCHEMA,
  isImageDataUrl,
  trackerPrompt,
  validateShelf,
  validateTracker,
  type TrackerApp,
} from '@/lib/consult/ai/scan'

/**
 * POST /api/consult/scan — read an upload into answers to confirm
 * (builds U1, U2).
 *
 *   { kind: 'shelf', image }                 → { items: ShelfItem[] }
 *   { kind: 'tracker', app, image }          → { read: TrackerRead }
 *
 * The image is a data URL the browser has already shrunk; it is type- and
 * size-checked, sent once, and never stored or logged. Only the consent tick
 * on the upload sheet sends it at all.
 */

export const dynamic = 'force-dynamic'

const overLimit = rateLimiter(10, 60_000)

export async function POST(req: Request) {
  if (overLimit()) return NextResponse.json({ fallback: true }, { status: 429 })
  let body: { kind?: unknown; app?: unknown; image?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ fallback: true })
  }
  if (!isImageDataUrl(body.image)) return NextResponse.json({ fallback: true, reason: 'image' })
  const kind = body.kind === 'shelf' || body.kind === 'tracker' ? body.kind : null
  const app = typeof body.app === 'string' && body.app in TRACKER_APPS ? (body.app as TrackerApp) : null
  if (!kind || (kind === 'tracker' && !app)) return NextResponse.json({ fallback: true })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ unavailable: true })

  try {
    const completion = await new OpenAI({ apiKey }).chat.completions.create(
      {
        model: COPY_MODEL,
        messages: [
          { role: 'system', content: kind === 'shelf' ? SHELF_PROMPT : trackerPrompt(app!) },
          { role: 'user', content: [{ type: 'image_url', image_url: { url: body.image, detail: 'high' } }] },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: kind === 'shelf' ? 'amp_shelf' : 'amp_tracker',
            strict: true,
            schema: (kind === 'shelf' ? SHELF_SCHEMA : TRACKER_SCHEMA) as unknown as Record<string, unknown>,
          },
        },
        max_tokens: 300,
        temperature: 0,
      },
      { timeout: 12_000, maxRetries: 0 },
    )
    const parsed = JSON.parse(completion.choices[0]?.message?.content?.trim() || '{}')
    return NextResponse.json(kind === 'shelf' ? { items: validateShelf(parsed) } : { read: validateTracker(parsed) })
  } catch (err) {
    // The error's name only: never the image.
    console.error('[consult-scan]', err instanceof Error ? err.name : 'error')
    return NextResponse.json({ fallback: true })
  }
}
