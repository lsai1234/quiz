/**
 * Ask your trainer: one key-value document per member (`trainer-thread:<userId>`),
 * so no schema change. In the member's data export and deleted with their
 * account (`lib/db/erasure`). Nothing here goes to an AI: a person reads every
 * question and writes every answer. Server-only.
 */
import { randomBytes } from 'node:crypto'
import { kvDelete, kvGet, kvListPrefix, kvSet } from '@/lib/db/kv'
import { cleanTutorialUrl } from '@/lib/training/tutorials'
import { MEMBER_MAX, TRAINER_MAX } from './copy'
import type { InboxRow, TrainerMessage, TrainerThread, TrainerVideo } from './types'

const PREFIX = 'trainer-thread:'
const key = (userId: string) => PREFIX + userId
/** Kept per thread; the oldest go first past this. */
export const MAX_MESSAGES = 300
const DAY = 86_400_000

export class TrainerError extends Error {
  constructor(public code: 'empty' | 'too-long' | 'limit' | 'video') {
    super(code)
  }
}

const id = () => randomBytes(9).toString('base64url')

/** Line breaks kept, runs of blank lines and spaces squeezed, ends trimmed. */
export function cleanText(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const cleanAbout = (raw: unknown) => (typeof raw === 'string' && raw.trim() ? raw.trim().replace(/\s+/g, ' ').slice(0, 80) : null)

export async function getThread(userId: string): Promise<TrainerThread | null> {
  const t = await kvGet<TrainerThread>(key(userId))
  return t && t.v === 1 && t.userId === userId ? t : null
}

async function save(t: TrainerThread): Promise<TrainerThread> {
  if (t.messages.length > MAX_MESSAGES) t.messages = t.messages.slice(-MAX_MESSAGES)
  await kvSet(key(t.userId), t)
  return t
}

/** Questions sent in the last 24 hours. */
export function askedToday(t: TrainerThread | null, now = new Date()): number {
  if (!t) return 0
  return t.messages.filter((m) => m.from === 'member' && now.getTime() - Date.parse(m.at) < DAY).length
}

/** Answers since the member last looked. */
export function unreadForMember(t: TrainerThread | null): number {
  if (!t) return 0
  const since = t.memberReadAt ? Date.parse(t.memberReadAt) : 0
  return t.messages.filter((m) => m.from === 'trainer' && Date.parse(m.at) > since).length
}

/** A member's question. Throws `TrainerError` for an empty or long one, or past today's limit. */
export async function askTrainer(
  who: { id: string; email: string; firstName: string | null },
  input: { text?: unknown; about?: unknown },
  dailyLimit: number,
  now = new Date(),
): Promise<{ thread: TrainerThread; message: TrainerMessage }> {
  const text = cleanText(input.text)
  if (!text) throw new TrainerError('empty')
  if (text.length > MEMBER_MAX) throw new TrainerError('too-long')
  const had = await getThread(who.id)
  if (askedToday(had, now) >= dailyLimit) throw new TrainerError('limit')
  const at = now.toISOString()
  const message: TrainerMessage = { id: id(), from: 'member', text, at, about: cleanAbout(input.about), video: null }
  const thread: TrainerThread = had ?? { v: 1, userId: who.id, email: who.email, firstName: who.firstName, messages: [], waiting: false, lastAt: at, memberReadAt: null, trainerReadAt: null }
  thread.email = who.email
  thread.firstName = who.firstName ?? thread.firstName
  thread.messages.push(message)
  thread.waiting = true
  thread.lastAt = at
  thread.memberReadAt = at
  return { thread: await save(thread), message }
}

/** A founder's answer. Throws `TrainerError` for an empty or long one, or a video link we wouldn't show. */
export async function answerMember(
  userId: string,
  input: { text?: unknown; videoUrl?: unknown; videoTitle?: unknown; by: string },
  now = new Date(),
): Promise<{ thread: TrainerThread; message: TrainerMessage } | null> {
  const thread = await getThread(userId)
  if (!thread) return null
  const text = cleanText(input.text)
  if (!text) throw new TrainerError('empty')
  if (text.length > TRAINER_MAX) throw new TrainerError('too-long')
  let video: TrainerVideo | null = null
  if (typeof input.videoUrl === 'string' && input.videoUrl.trim()) {
    const url = cleanTutorialUrl(input.videoUrl)
    if (!url) throw new TrainerError('video')
    video = { url, title: typeof input.videoTitle === 'string' && input.videoTitle.trim() ? input.videoTitle.trim().slice(0, 80) : null }
  }
  const at = now.toISOString()
  const message: TrainerMessage = { id: id(), from: 'trainer', text, at, about: null, video, by: input.by.slice(0, 120) }
  thread.messages.push(message)
  thread.waiting = false
  thread.lastAt = at
  thread.trainerReadAt = at
  return { thread: await save(thread), message }
}

export async function markMemberRead(userId: string, now = new Date()): Promise<void> {
  const t = await getThread(userId)
  if (!t || unreadForMember(t) === 0) return
  t.memberReadAt = now.toISOString()
  await save(t)
}

export async function markTrainerRead(userId: string, now = new Date()): Promise<void> {
  const t = await getThread(userId)
  if (!t) return
  t.trainerReadAt = now.toISOString()
  await save(t)
}

/** Answered some other way (a call, an email): off the waiting list without a message. */
export async function setWaiting(userId: string, waiting: boolean): Promise<TrainerThread | null> {
  const t = await getThread(userId)
  if (!t) return null
  t.waiting = waiting
  return save(t)
}

/** The Founders Hub's inbox: waiting first, longest wait at the top; then the newest. */
export async function listInbox(limit = 500): Promise<InboxRow[]> {
  const rows = (await kvListPrefix<TrainerThread>(PREFIX, limit))
    .map((r) => r.value)
    .filter((t): t is TrainerThread => Boolean(t && t.v === 1 && t.messages?.length))
    .map((t): InboxRow => {
      const last = t.messages[t.messages.length - 1]
      // The first of the member's messages since the last answer.
      let i = t.messages.length - 1
      while (i > 0 && t.messages[i - 1].from === 'member') i--
      const since = t.waiting && t.messages[i]?.from === 'member' ? t.messages[i].at : null
      const seen = t.trainerReadAt ? Date.parse(t.trainerReadAt) : 0
      return {
        userId: t.userId,
        email: t.email,
        firstName: t.firstName,
        waiting: t.waiting,
        waitingSince: since,
        lastAt: t.lastAt,
        preview: last.text.slice(0, 140),
        messages: t.messages.length,
        unread: t.messages.some((m) => m.from === 'member' && Date.parse(m.at) > seen),
      }
    })
  return rows.sort((a, b) => {
    if (a.waiting !== b.waiting) return a.waiting ? -1 : 1
    if (a.waiting) return Date.parse(a.waitingSince ?? a.lastAt) - Date.parse(b.waitingSince ?? b.lastAt)
    return Date.parse(b.lastAt) - Date.parse(a.lastAt)
  })
}

/** Erasure. True when there was something to delete. */
export async function deleteThread(userId: string): Promise<boolean> {
  const had = (await getThread(userId)) !== null
  await kvDelete(key(userId))
  return had
}

/**
 * The trainer writes first: a note with a checked plan. Starts the thread when
 * there isn't one yet, and leaves any wait on a question as it was.
 */
export async function noteFromTrainer(
  who: { userId: string; email: string; firstName: string | null },
  input: { text?: unknown; about?: string | null; by: string },
  now = new Date(),
): Promise<{ thread: TrainerThread; message: TrainerMessage }> {
  const text = cleanText(input.text)
  if (!text) throw new TrainerError('empty')
  if (text.length > TRAINER_MAX) throw new TrainerError('too-long')
  const at = now.toISOString()
  const thread: TrainerThread = (await getThread(who.userId)) ?? {
    v: 1,
    userId: who.userId,
    email: who.email,
    firstName: who.firstName,
    messages: [],
    waiting: false,
    lastAt: at,
    memberReadAt: null,
    trainerReadAt: at,
  }
  const message: TrainerMessage = { id: id(), from: 'trainer', text, at, about: input.about ?? null, video: null, by: input.by.slice(0, 120) }
  thread.messages.push(message)
  thread.lastAt = at
  return { thread: await save(thread), message }
}
