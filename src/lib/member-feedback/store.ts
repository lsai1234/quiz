/**
 * What members tell us, from the hub's feedback page (`/myhub/feedback`), for
 * the founders to read in Settings → Member feedback.
 *
 * Not the check-in (`lib/feedback`, `/api/hub/feedback`): that asks about their
 * products, on a schedule, as ratings. This is one open box for anything at all,
 * whenever they like, so the product can be changed by what people say about it.
 *
 * One row per message in the key-value table (`member-feedback:<id>`), so it
 * needed no new table. A member's messages go with their account when they ask
 * for it to be deleted (`db/erasure`) and come with their data when they ask for
 * a copy.
 */
import crypto from 'crypto'
import { kvDelete, kvGet, kvListPrefix, kvSet } from '@/lib/db/kv'

import { FEEDBACK_MAX, FEEDBACK_MIN, FEEDBACK_PER_DAY } from './limits'

export { FEEDBACK_MAX, FEEDBACK_MIN, FEEDBACK_PER_DAY }
/** How many the inbox reads. */
export const FEEDBACK_INBOX_LIMIT = 500

export type FeedbackAccess = 'subscriber' | 'member' | 'ended' | 'none'

export interface MemberFeedback {
  id: string
  /** What they wrote: trimmed, never otherwise changed. */
  text: string
  userId: string
  email: string | null
  name: string | null
  /** Where they were with us when they wrote it (`hubAccess`): useful context for what they say. */
  access: FeedbackAccess
  createdAt: string
}

const PREFIX = 'member-feedback:'
/** When a founder last opened the inbox, so newer messages can say "New". Not under PREFIX. */
const SEEN_KEY = 'member-feedback-seen'
const DAY = 24 * 60 * 60 * 1000

export type FeedbackCheck = { ok: true; text: string } | { ok: false; error: string }

/** Whether a message can be sent, and the text as it will be kept. */
export function checkFeedbackText(raw: unknown): FeedbackCheck {
  if (typeof raw !== 'string') return { ok: false, error: 'Write something first.' }
  const text = raw.replace(/\r\n?/g, '\n').trim()
  if (text.length < FEEDBACK_MIN) return { ok: false, error: 'Write a little more first.' }
  if (text.length > FEEDBACK_MAX) return { ok: false, error: `That’s over ${FEEDBACK_MAX} characters. Could you make it a little shorter?` }
  return { ok: true, text }
}

export async function listMemberFeedback(limit = FEEDBACK_INBOX_LIMIT): Promise<MemberFeedback[]> {
  const rows = await kvListPrefix<MemberFeedback>(PREFIX, limit)
  return rows.map((r) => r.value).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Keep a message, unless they have already sent their day's worth. */
export async function addMemberFeedback(
  input: Omit<MemberFeedback, 'id' | 'createdAt'>,
  now: Date = new Date(),
): Promise<MemberFeedback | 'too-many'> {
  const today = (await listMemberFeedback()).filter(
    (f) => f.userId === input.userId && now.getTime() - Date.parse(f.createdAt) < DAY,
  )
  if (today.length >= FEEDBACK_PER_DAY) return 'too-many'
  const entry: MemberFeedback = { ...input, id: crypto.randomUUID(), createdAt: now.toISOString() }
  await kvSet(`${PREFIX}${entry.id}`, entry)
  return entry
}

export async function deleteMemberFeedback(id: string): Promise<void> {
  await kvDelete(`${PREFIX}${id}`)
}

/** Everything one member sent, for a copy of their data. */
export async function memberFeedbackFor(userId: string): Promise<MemberFeedback[]> {
  return (await listMemberFeedback(Number.MAX_SAFE_INTEGER)).filter((f) => f.userId === userId)
}

/** Delete everything one member sent, for an erasure. Returns how many went. */
export async function deleteMemberFeedbackFor(userId: string): Promise<number> {
  const theirs = await memberFeedbackFor(userId)
  for (const f of theirs) await deleteMemberFeedback(f.id)
  return theirs.length
}

export async function feedbackSeenAt(): Promise<string | null> {
  return (await kvGet<string>(SEEN_KEY)) ?? null
}

export async function markFeedbackSeen(at: Date = new Date()): Promise<void> {
  await kvSet(SEEN_KEY, at.toISOString())
}
