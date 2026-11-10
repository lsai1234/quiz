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
import { TRIAGE_TAGS, type InboxRow, type MessageContext, type TriageTag, type TrainerMessage, type TrainerThread, type TrainerVideo } from './types'

const PREFIX = 'trainer-thread:'
const key = (userId: string) => PREFIX + userId
/** Kept per thread; the oldest go first past this. */
export const MAX_MESSAGES = 300
const DAY = 86_400_000

export class TrainerError extends Error {
  constructor(public code: 'empty' | 'too-long' | 'limit' | 'video' | 'clip') {
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

/** The set a question was asked from, with sensible numbers or none. */
export function cleanContext(raw: unknown): MessageContext | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const n = (v: unknown, max: number, step = 1) => {
    const x = typeof v === 'string' ? Number(v) : v
    return typeof x === 'number' && Number.isFinite(x) && x > 0 && x <= max ? Math.round(x / step) * step : null
  }
  const felt = r.felt === 'easy' || r.felt === 'right' || r.felt === 'hard' ? r.felt : null
  const c: MessageContext = { set: n(r.set, 20), of: n(r.of, 20), kg: n(r.kg, 500, 0.25), reps: n(r.reps, 300), felt }
  return Object.values(c).some((v) => v !== null) ? c : null
}

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

/**
 * A clip from our own storage, for a message: a member's own finished form
 * check, or a video note the founders uploaded (which becomes the member's,
 * so they can play it). Throws `TrainerError('clip')` for anything else.
 */
async function clipFor(raw: unknown, want: 'form-check' | 'note', member: string): Promise<TrainerVideo | null> {
  if (raw == null || raw === '') return null
  const { getMedia, mediaUrl, setMediaOwner } = await import('@/lib/media/store')
  const m = typeof raw === 'string' ? await getMedia(raw) : null
  if (!m || m.state !== 'ready' || m.kind !== want) throw new TrainerError('clip')
  if (want === 'form-check' && m.owner !== member) throw new TrainerError('clip')
  if (want === 'note') {
    if (m.owner && m.owner !== member) throw new TrainerError('clip')
    if (!m.owner) await setMediaOwner(m.id, member)
  }
  return { url: mediaUrl(m.id), title: m.title, media: m.id, until: m.expiresAt }
}

/** A member's question. Throws `TrainerError` for an empty or long one, or past today's limit. */
export async function askTrainer(
  who: { id: string; email: string; firstName: string | null },
  input: { text?: unknown; about?: unknown; context?: unknown; videoId?: unknown },
  dailyLimit: number,
  now = new Date(),
): Promise<{ thread: TrainerThread; message: TrainerMessage }> {
  const text = cleanText(input.text)
  if (!text) throw new TrainerError('empty')
  if (text.length > MEMBER_MAX) throw new TrainerError('too-long')
  const had = await getThread(who.id)
  if (askedToday(had, now) >= dailyLimit) throw new TrainerError('limit')
  const video = await clipFor(input.videoId, 'form-check', who.id)
  const at = now.toISOString()
  const context = cleanContext(input.context)
  const message: TrainerMessage = { id: id(), from: 'member', text, at, about: cleanAbout(input.about), video, ...(context ? { context } : {}) }
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
  input: { text?: unknown; videoUrl?: unknown; videoTitle?: unknown; videoId?: unknown; by: string },
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
  // A video note in place of a link.
  if (!video && input.videoId) video = await clipFor(input.videoId, 'note', userId)
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
/**
 * The inbox: real members, or, with the Founders Hub's sample switch on, only
 * the sample members from Settings → Test views. Never both at once.
 */
export async function listInbox(limit = 500, which: 'real' | 'samples' = 'real'): Promise<InboxRow[]> {
  const { sampleMemberIds } = await import('@/lib/samples/registry')
  const samples = await sampleMemberIds()
  const rows = (await kvListPrefix<TrainerThread>(PREFIX, limit))
    .map((r) => r.value)
    .filter((t): t is TrainerThread => Boolean(t && t.v === 1 && t.messages?.length))
    .filter((t) => samples.has(t.userId) === (which === 'samples'))
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
  input: { text?: unknown; about?: string | null; by: string; kind?: TrainerMessage['kind'] },
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
  const message: TrainerMessage = { id: id(), from: 'trainer', text, at, about: input.about ?? null, video: null, by: input.by.slice(0, 120), ...(input.kind ? { kind: input.kind } : {}) }
  thread.messages.push(message)
  thread.lastAt = at
  return { thread: await save(thread), message }
}

/** The member rates an answer: helpful, or not quite. Null when there's no such answer. */
export async function rateAnswer(userId: string, messageId: string, rating: 'helpful' | 'not-quite'): Promise<TrainerThread | null> {
  const t = await getThread(userId)
  const m = t?.messages.find((x) => x.id === messageId && x.from === 'trainer' && !x.kind)
  if (!t || !m) return null
  m.rating = rating
  return save(t)
}

/** The trainer sorts a member's question. Null when there's no such question. */
export async function tagQuestion(userId: string, messageId: string, tag: TriageTag | null): Promise<TrainerThread | null> {
  const t = await getThread(userId)
  const m = t?.messages.find((x) => x.id === messageId && x.from === 'member')
  if (!t || !m || (tag !== null && !TRIAGE_TAGS.includes(tag))) return null
  m.tag = tag
  return save(t)
}

/** The member says yes (or no) to showing an answer and its question, without their name. */
export async function setShareOk(userId: string, messageId: string, ok: boolean): Promise<TrainerThread | null> {
  const t = await getThread(userId)
  const m = t?.messages.find((x) => x.id === messageId && x.from === 'trainer' && !x.kind)
  if (!t || !m) return null
  m.shareOk = ok
  return save(t)
}

/** The question an answer was to: the member's messages just before it, joined. */
export function questionFor(t: TrainerThread, answerId: string): { text: string; about: string | null } | null {
  const i = t.messages.findIndex((m) => m.id === answerId)
  if (i <= 0) return null
  const asked: TrainerMessage[] = []
  for (let j = i - 1; j >= 0 && t.messages[j].from === 'member'; j--) asked.unshift(t.messages[j])
  if (!asked.length) return null
  return { text: asked.map((m) => m.text).join('\n\n'), about: asked.find((m) => m.about)?.about ?? null }
}

/** The trainer has opened the thread since the member's last question. */
export function readByTrainer(t: TrainerThread | null): boolean {
  if (!t?.trainerReadAt) return false
  const lastMember = [...t.messages].reverse().find((m) => m.from === 'member')
  return Boolean(lastMember && Date.parse(t.trainerReadAt) >= Date.parse(lastMember.at))
}

/**
 * The welcome the trainer wrote once, to a member whose hub has just opened:
 * once per member, never twice. Null when there's nothing to send.
 */
export async function ensureWelcome(who: { userId: string; email: string; firstName: string | null }, welcome: string, now = new Date()): Promise<TrainerThread | null> {
  if (!welcome.trim()) return null
  const t = await getThread(who.userId)
  if (t?.messages.some((m) => m.kind === 'welcome')) return null
  const { thread } = await noteFromTrainer(who, { text: welcome, by: 'welcome', kind: 'welcome' }, now)
  return thread
}

export interface ReplyStats {
  /** Median hours from a question to its answer, over the window. */
  medianHours: number | null
  /** Questions answered in the window. */
  answered: number
  /** Of the answers rated, how many were helpful. */
  rated: number
  helpful: number
  /** Answered within the stated reply time. */
  withinPromise: number
}

/** Questions to answers, real members only, over the last `days`. */
export function replyStatsFrom(threads: TrainerThread[], promiseHours: number, now = new Date(), days = 30): ReplyStats {
  const since = now.getTime() - days * DAY
  const waits: number[] = []
  let rated = 0
  let helpful = 0
  for (const t of threads) {
    let asked: number | null = null
    for (const m of t.messages) {
      if (m.from === 'member') {
        if (asked === null) asked = Date.parse(m.at)
        continue
      }
      if (m.kind) continue
      if (asked !== null && Date.parse(m.at) >= since) waits.push((Date.parse(m.at) - asked) / 3_600_000)
      asked = null
      if (Date.parse(m.at) >= since && m.rating) {
        rated++
        if (m.rating === 'helpful') helpful++
      }
    }
  }
  waits.sort((a, b) => a - b)
  const median = waits.length ? (waits.length % 2 ? waits[(waits.length - 1) / 2] : (waits[waits.length / 2 - 1] + waits[waits.length / 2]) / 2) : null
  return { medianHours: median === null ? null : Math.round(median * 10) / 10, answered: waits.length, rated, helpful, withinPromise: waits.filter((w) => w <= promiseHours).length }
}

let statsCache: { at: number; promise: number; stats: ReplyStats } | null = null

/** The reply stats across real members, worked out at most every ten minutes. */
export async function replyStats(promiseHours: number, now = new Date()): Promise<ReplyStats> {
  if (statsCache && statsCache.promise === promiseHours && now.getTime() - statsCache.at < 600_000) return statsCache.stats
  const { sampleMemberIds } = await import('@/lib/samples/registry')
  const samples = await sampleMemberIds()
  const threads = (await kvListPrefix<TrainerThread>(PREFIX, 5000)).map((r) => r.value).filter((t): t is TrainerThread => Boolean(t?.v === 1 && !samples.has(t.userId)))
  const stats = replyStatsFrom(threads, promiseHours, now)
  statsCache = { at: now.getTime(), promise: promiseHours, stats }
  return stats
}

/** Enough answers to show a measured reply time rather than the promise. */
export const MEDIAN_FLOOR = 20
