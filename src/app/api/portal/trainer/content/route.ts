import { NextResponse } from 'next/server'
import { isPortalAuthed } from '@/lib/portal/guard'
import { getLiveOfferSettings, getOfferSettings } from '@/lib/offer/store'
import { coachingOn } from '@/lib/offer/settings'
import {
  clearFeatured,
  ContentError,
  deleteLibraryEntry,
  deleteReply,
  getFeatured,
  library,
  saveLibraryEntry,
  saveReply,
  savedReplies,
  setFeatured,
} from '@/lib/trainer/content'

/**
 * Founders Hub → Trainer: what the trainer writes once and uses again.
 *
 *   GET     { replies, library, featured, video }  (`?samples=1`: video as the test view has it)
 *   POST    { kind: 'reply', id?, title, text, tag? }       add or change a saved reply
 *           { kind: 'library', id?, about?, question, answer }  add or change a library entry
 *           { kind: 'featured', userId, messageId, question?, answer? }  feature an answer the member said yes to
 *   DELETE  ?kind=reply&id= · ?kind=library&id= · ?kind=featured
 */
export const dynamic = 'force-dynamic'

const MESSAGES: Record<ContentError['code'], string> = {
  empty: 'Write both parts first.',
  'too-long': 'That’s too long.',
  missing: 'That answer has gone.',
  'not-shared': 'The member hasn’t said yes to sharing this one.',
}

/** `samples`: the sample inbox (Test views) follows the test view's switches; everywhere else, what's really on. */
async function payload(samples = false) {
  const [replies, entries, featured, settings] = await Promise.all([savedReplies(), library(), getFeatured(), samples ? getOfferSettings() : getLiveOfferSettings()])
  return { replies, library: entries, featured, video: coachingOn(settings, 'video') }
}

export async function GET(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await payload(new URL(req.url).searchParams.get('samples') === '1'))
}

export async function POST(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  try {
    if (body.kind === 'reply') await saveReply(body)
    else if (body.kind === 'library') await saveLibraryEntry(body)
    else if (body.kind === 'featured' && typeof body.userId === 'string' && typeof body.messageId === 'string')
      await setFeatured({ userId: body.userId, messageId: body.messageId, question: body.question, answer: body.answer })
    else return NextResponse.json({ error: 'What is this?' }, { status: 400 })
  } catch (err) {
    if (err instanceof ContentError) return NextResponse.json({ error: MESSAGES[err.code] }, { status: 400 })
    throw err
  }
  return NextResponse.json(await payload())
}

export async function DELETE(req: Request) {
  if (!(await isPortalAuthed())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const id = q.get('id') ?? ''
  if (q.get('kind') === 'reply' && id) await deleteReply(id)
  else if (q.get('kind') === 'library' && id) await deleteLibraryEntry(id)
  else if (q.get('kind') === 'featured') await clearFeatured()
  else return NextResponse.json({ error: 'What is this?' }, { status: 400 })
  return NextResponse.json(await payload())
}
