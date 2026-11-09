/**
 * The live calendar (server-only): a private address a calendar app
 * subscribes to once, which then follows every change to the plan. The
 * address carries an unguessable key, the member can replace it (which
 * stops the old one), and it says only what and when.
 */
import { randomBytes } from 'node:crypto'
import { kvDelete, kvGet, kvSet } from '@/lib/db/kv'

const key = (token: string) => `training-cal:${token}`
const SHAPE = /^[A-Za-z0-9_-]{32}$/

export function newCalendarToken(): string {
  return randomBytes(24).toString('base64url')
}

export async function linkCalendar(token: string, userId: string, replacing?: string | null): Promise<void> {
  if (replacing && SHAPE.test(replacing)) await kvDelete(key(replacing))
  await kvSet(key(token), userId)
}

export async function userForCalendar(token: string): Promise<string | null> {
  if (!SHAPE.test(token)) return null
  return (await kvGet<string>(key(token))) ?? null
}

export async function unlinkCalendar(token: string | null | undefined): Promise<void> {
  if (token && SHAPE.test(token)) await kvDelete(key(token))
}

/** The subscribe address, as a calendar app wants it. */
export function calendarFeedUrl(base: string, token: string): string {
  return `${base}/api/training/calendar/${token}`
}
