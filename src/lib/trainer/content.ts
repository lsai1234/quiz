/**
 * What the trainer writes once and uses again (video phase), server-only, in
 * the key-value store so no schema change:
 *
 *   saved replies    `trainer-saved-replies`: a title, the text, and the tag
 *                    it fits; the pain reply is built in and can't be removed
 *   answers library  `trainer-library`: a question and answer the trainer
 *                    rewrote without anything that could identify the member,
 *                    shown to members before they ask
 *   featured         `trainer-featured`: one real exchange for the results
 *                    page, only with the member's yes; it comes down if they
 *                    change their mind or their account goes
 */
import { randomBytes } from 'node:crypto'
import { kvGet, kvSet } from '@/lib/db/kv'
import { MEMBER_MAX, TRAINER_MAX } from './copy'
import { cleanText } from './store'
import { TRIAGE_TAGS, type LibraryEntry, type TriageTag } from './types'
import { VIDEO_COPY } from './video-copy'

const id = () => randomBytes(9).toString('base64url')
const tagOf = (v: unknown): TriageTag | null => (TRIAGE_TAGS.includes(v as TriageTag) ? (v as TriageTag) : null)
const line = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

export class ContentError extends Error {
  constructor(public code: 'empty' | 'too-long' | 'missing' | 'not-shared') {
    super(code)
  }
}

/* ── Saved replies ────────────────────────────────────────────────────────── */

export interface SavedReply {
  id: string
  title: string
  text: string
  tag: TriageTag | null
  /** The pain reply: always there, words from the review pack. */
  builtIn?: boolean
}

const REPLIES = 'trainer-saved-replies'
export const PAIN_REPLY: SavedReply = { id: 'pain', title: VIDEO_COPY.painReplyTitle, text: VIDEO_COPY.painReply, tag: 'pain', builtIn: true }

export async function savedReplies(): Promise<SavedReply[]> {
  const own = ((await kvGet<SavedReply[]>(REPLIES)) ?? []).filter((r) => r && typeof r.text === 'string')
  return [PAIN_REPLY, ...own]
}

/** Add one, or change one by its id. */
export async function saveReply(input: { id?: unknown; title?: unknown; text?: unknown; tag?: unknown }): Promise<SavedReply[]> {
  const title = line(input.title, 80)
  const text = cleanText(input.text)
  if (!title || !text) throw new ContentError('empty')
  if (text.length > TRAINER_MAX) throw new ContentError('too-long')
  const own = ((await kvGet<SavedReply[]>(REPLIES)) ?? []).filter(Boolean)
  const reply: SavedReply = { id: typeof input.id === 'string' && own.some((r) => r.id === input.id) ? input.id : id(), title, text, tag: tagOf(input.tag) }
  const next = own.some((r) => r.id === reply.id) ? own.map((r) => (r.id === reply.id ? reply : r)) : [...own, reply].slice(-100)
  await kvSet(REPLIES, next)
  return savedReplies()
}

export async function deleteReply(replyId: string): Promise<SavedReply[]> {
  const own = ((await kvGet<SavedReply[]>(REPLIES)) ?? []).filter((r) => r && r.id !== replyId)
  await kvSet(REPLIES, own)
  return savedReplies()
}

export { mentionsPain } from './triage'

/* ── The answers library ──────────────────────────────────────────────────── */

const LIBRARY = 'trainer-library'

export async function library(): Promise<LibraryEntry[]> {
  return ((await kvGet<LibraryEntry[]>(LIBRARY)) ?? []).filter((e) => e && e.question && e.answer).sort((a, b) => b.at.localeCompare(a.at))
}

export async function saveLibraryEntry(input: { id?: unknown; about?: unknown; question?: unknown; answer?: unknown }, now = new Date()): Promise<LibraryEntry[]> {
  const question = cleanText(input.question)
  const answer = cleanText(input.answer)
  if (!question || !answer) throw new ContentError('empty')
  if (question.length > MEMBER_MAX || answer.length > TRAINER_MAX) throw new ContentError('too-long')
  const all = await library()
  const had = typeof input.id === 'string' ? all.find((e) => e.id === input.id) : undefined
  const entry: LibraryEntry = { id: had?.id ?? id(), about: line(input.about, 80) || null, question, answer, at: had?.at ?? now.toISOString() }
  await kvSet(LIBRARY, had ? all.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...all].slice(0, 300))
  return library()
}

export async function deleteLibraryEntry(entryId: string): Promise<LibraryEntry[]> {
  await kvSet(
    LIBRARY,
    (await library()).filter((e) => e.id !== entryId),
  )
  return library()
}

/* ── The featured exchange ────────────────────────────────────────────────── */

export interface Featured {
  question: string
  answer: string
  about: string | null
  at: string
  /** Where it came from, so it comes down when they change their mind or leave. Never shown. */
  source: { userId: string; messageId: string }
}

const FEATURED = 'trainer-featured'

export async function getFeatured(): Promise<Featured | null> {
  return (await kvGet<Featured | null>(FEATURED)) ?? null
}

/**
 * Feature an answer the member said yes to sharing. The words can be tidied
 * (a name, a place), never added to. Throws `not-shared` without their yes.
 */
export async function setFeatured(input: { userId: string; messageId: string; question?: unknown; answer?: unknown }, now = new Date()): Promise<Featured> {
  const { getThread, questionFor } = await import('./store')
  const t = await getThread(input.userId)
  const m = t?.messages.find((x) => x.id === input.messageId && x.from === 'trainer' && !x.kind)
  if (!t || !m) throw new ContentError('missing')
  if (m.shareOk !== true) throw new ContentError('not-shared')
  const q = questionFor(t, m.id)
  const question = cleanText(input.question) || q?.text || ''
  const answer = cleanText(input.answer) || m.text
  if (!question || !answer) throw new ContentError('empty')
  if (question.length > MEMBER_MAX || answer.length > TRAINER_MAX) throw new ContentError('too-long')
  const featured: Featured = { question, answer, about: q?.about ?? null, at: now.toISOString(), source: { userId: input.userId, messageId: m.id } }
  await kvSet(FEATURED, featured)
  return featured
}

export async function clearFeatured(): Promise<void> {
  await kvSet(FEATURED, null)
}

/** Take it down when it came from this member (and this answer, when named). */
export async function withdrawFeatured(userId: string, messageId?: string): Promise<boolean> {
  const f = await getFeatured()
  if (!f || f.source.userId !== userId || (messageId && f.source.messageId !== messageId)) return false
  await clearFeatured()
  return true
}
