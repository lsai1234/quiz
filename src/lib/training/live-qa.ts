/**
 * The monthly live Q&A (Phase 3): an hour with the trainer, open to every
 * member with an open hub, while Programmes and goals is on. One session at a
 * time in the key-value store (`training-live-qa`), set in Settings → Training
 * plan: when, how long, the join link and, afterwards, the recording.
 *
 * Members see the join link from a day before until it ends, and the
 * recording for 90 days from the session; after that it's gone from the hub
 * (and the Founders Hub says to delete it where it's hosted). Server-only.
 */
import { kvGet, kvSet } from '@/lib/db/kv'
import { RETENTION } from '@/lib/legal/content'

/** From the privacy notice's retention table, so the two can't drift apart. */
export const RECORDING_DAYS = RETENTION.liveQaRecordingDays
const DAY = 86_400_000
const KEY = 'training-live-qa'

export interface LiveQa {
  title: string
  startsAt: string
  minutes: number
  joinUrl: string | null
  recordingUrl: string | null
  updatedAt: string
}

/** What a member sees: null when there's nothing to show. */
export interface LiveQaView {
  title: string
  startsAt: string
  minutes: number
  /** From a day before until it ends. */
  joinUrl: string | null
  upcoming: boolean
  recording: { url: string; until: string } | null
}

export class LiveQaError extends Error {}

const https = (v: unknown): string | null => {
  if (typeof v !== 'string' || !v.trim()) return null
  try {
    const u = new URL(v.trim())
    if (u.protocol !== 'https:') throw new LiveQaError('Use an https link.')
    return u.toString().slice(0, 500)
  } catch (err) {
    throw err instanceof LiveQaError ? err : new LiveQaError('That isn’t a link we can use.')
  }
}

export async function getLiveQa(): Promise<LiveQa | null> {
  return (await kvGet<LiveQa | null>(KEY)) ?? null
}

/** Set the session (or clear it with null). Throws `LiveQaError` for anything we wouldn't show. */
export async function saveLiveQa(input: Record<string, unknown> | null, now = new Date()): Promise<LiveQa | null> {
  if (!input) {
    await kvSet(KEY, null)
    return null
  }
  const title = typeof input.title === 'string' && input.title.trim() ? input.title.replace(/\s+/g, ' ').trim().slice(0, 80) : 'Live Q&A'
  const starts = typeof input.startsAt === 'string' ? Date.parse(input.startsAt) : NaN
  if (!Number.isFinite(starts)) throw new LiveQaError('When is it?')
  const minutes = Math.round(Number(input.minutes))
  if (!Number.isFinite(minutes) || minutes < 15 || minutes > 180) throw new LiveQaError('Between 15 and 180 minutes.')
  const qa: LiveQa = { title, startsAt: new Date(starts).toISOString(), minutes, joinUrl: https(input.joinUrl), recordingUrl: https(input.recordingUrl), updatedAt: now.toISOString() }
  await kvSet(KEY, qa)
  return qa
}

export function liveQaView(qa: LiveQa | null, now: Date): LiveQaView | null {
  if (!qa) return null
  const start = Date.parse(qa.startsAt)
  const end = start + qa.minutes * 60_000
  const until = start + RECORDING_DAYS * DAY
  const upcoming = now.getTime() < end
  const recording = !upcoming && qa.recordingUrl && now.getTime() < until ? { url: qa.recordingUrl, until: new Date(until).toISOString() } : null
  if (!upcoming && !recording) return null
  return {
    title: qa.title,
    startsAt: qa.startsAt,
    minutes: qa.minutes,
    joinUrl: upcoming && now.getTime() >= start - DAY ? qa.joinUrl : null,
    upcoming,
    recording,
  }
}

/** The calendar invite: one event, with a link back to the hub (where the join link is). */
export function liveQaIcs(qa: LiveQa, hubUrl: string, now = new Date()): string {
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const start = Date.parse(qa.startsAt)
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CHRGD//Live QA//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:live-qa-${stamp(start)}@chrgd`,
    `DTSTAMP:${stamp(now.getTime())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(start + qa.minutes * 60_000)}`,
    `SUMMARY:${esc(qa.title)}`,
    `DESCRIPTION:${esc(`The join link is in your member hub: ${hubUrl}`)}`,
    `URL:${hubUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}
