import { NextResponse } from 'next/server'
import { getHubUser } from '@/lib/auth/session'
import { rateLimiter } from '@/lib/consult/ai/guard'
import { hubAccess, isOpen } from '@/lib/hub/access'
import { beginUpload, finishUpload, formChecksSince, getMedia, mediaUrl, MediaError, putChunk } from '@/lib/media/store'
import { getOfferSettings } from '@/lib/offer/store'
import { coachingOn, trainerLive } from '@/lib/offer/settings'

/**
 * POST /api/hub/media  (the signed-in member, while their hub is open)
 *   { action: 'begin', size, mime, seconds, consent: true, still? } → { id }
 *   { action: 'chunk', id, n, data }                                 → { ok }
 *   { action: 'finish', id }                                         → { id, url, until }
 *
 * A form check for the trainer: up to 30 seconds and 30 MB, three a day, only
 * with their yes, while video and the trainer are on. Theirs alone (and the
 * founders'), deleted after 30 days (`lib/media/store`). It reaches the
 * trainer when they send it with a question (`/api/hub/trainer`).
 */
export const dynamic = 'force-dynamic'

const FORM_CHECK_SECONDS = 30
const FORM_CHECKS_A_DAY = 3
const busy = rateLimiter(600, 60_000)

const MESSAGES: Record<MediaError['code'], string> = {
  type: 'That isn’t a video we can play. Use an MP4 or a MOV from your phone.',
  size: 'That clip is too big. Keep it under 30 MB.',
  missing: 'That upload has gone. Start it again.',
  chunk: 'Part of the clip didn’t arrive. Start it again.',
  incomplete: 'The clip didn’t finish uploading. Start it again.',
}

export async function POST(req: Request) {
  const user = await getHubUser()
  if (!user) return NextResponse.json({ error: 'Sign in' }, { status: 401 })
  if (busy()) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  const settings = await getOfferSettings()
  if (!trainerLive(settings) || !coachingOn(settings, 'video')) return NextResponse.json({ error: 'Not available' }, { status: 404 })
  if (!isOpen(await hubAccess(user))) return NextResponse.json({ error: 'closed' }, { status: 403 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  try {
    if (body.action === 'begin') {
      if (body.consent !== true) return NextResponse.json({ error: 'Say you’re happy to send it first.' }, { status: 400 })
      const seconds = Number(body.seconds)
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > FORM_CHECK_SECONDS + 0.5) return NextResponse.json({ error: 'That clip is longer than 30 seconds.', code: 'long' }, { status: 400 })
      if ((await formChecksSince(user.id, new Date(Date.now() - 86_400_000))) >= FORM_CHECKS_A_DAY) return NextResponse.json({ error: 'That’s three form checks today.', code: 'limit' }, { status: 429 })
      const m = await beginUpload({ kind: 'form-check', mime: String(body.mime ?? ''), size: Number(body.size), owner: user.id, title: null, still: typeof body.still === 'string' ? body.still : null })
      return NextResponse.json({ id: m.id })
    }
    // Chunks and the finish only into their own upload.
    const m = await getMedia(String(body.id ?? ''))
    if (!m || m.owner !== user.id || m.kind !== 'form-check') return NextResponse.json({ error: MESSAGES.missing }, { status: 404 })
    if (body.action === 'chunk') {
      await putChunk(m.id, Number(body.n), String(body.data ?? ''))
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'finish') {
      const done = await finishUpload(m.id)
      return NextResponse.json({ id: done.id, url: mediaUrl(done.id), until: done.expiresAt })
    }
  } catch (err) {
    if (err instanceof MediaError) return NextResponse.json({ error: MESSAGES[err.code], code: err.code }, { status: 400 })
    throw err
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
