/**
 * Uploaded video (server-only): exercise demos, the trainer's welcome and
 * results-page intro, video notes, and members' form-check clips.
 *
 * Stored in the app's own key-value store, in chunks, so there's no new
 * table and no outside service: `media:<id>` holds what it is and who it
 * belongs to, `media-chunk:<id>:<n>` holds up to a megabyte of it. Moving to
 * a video host later is a swap behind `mediaUrl` and `readRange`. Uploads
 * arrive a chunk at a time, small enough for any request limit.
 *
 * Form checks are a member's personal data: private to them and the
 * founders, deleted after 30 days (`sweepExpiredMedia`), in their data
 * export while kept, and deleted with their account.
 */
import { randomBytes } from 'node:crypto'
import { kvDelete, kvGet, kvListPrefix, kvSet } from '@/lib/db/kv'

export type MediaKind = 'exercise' | 'trainer' | 'note' | 'form-check'

export interface MediaRecord {
  v: 1
  id: string
  kind: MediaKind
  mime: string
  size: number
  chunks: number
  /** The member it belongs to (form checks); null for the founders' own. */
  owner: string | null
  title: string | null
  /** A still from the clip, as a small JPEG data URI, for the poster frame. */
  still: string | null
  state: 'uploading' | 'ready'
  createdAt: string
  /** Deleted after this (form checks: 30 days). */
  expiresAt: string | null
}

export const CHUNK_BYTES = 1024 * 1024
export const MEDIA_MIMES = ['video/mp4', 'video/quicktime', 'video/webm'] as const
/** The most a clip of each kind can be. */
export const MEDIA_MAX_BYTES: Record<MediaKind, number> = {
  exercise: 60 * 1024 * 1024,
  trainer: 60 * 1024 * 1024,
  note: 40 * 1024 * 1024,
  'form-check': 30 * 1024 * 1024,
}
export const FORM_CHECK_DAYS = 30
const STILL_MAX = 200_000

const metaKey = (id: string) => `media:${id}`
const chunkKey = (id: string, n: number) => `media-chunk:${id}:${n}`
const SHAPE = /^m_[A-Za-z0-9_-]{22}$/

export class MediaError extends Error {
  constructor(public code: 'type' | 'size' | 'missing' | 'chunk' | 'incomplete') {
    super(code)
  }
}

export function isMediaId(id: unknown): id is string {
  return typeof id === 'string' && SHAPE.test(id)
}

export function mediaUrl(id: string): string {
  return `/api/media/${id}`
}

export async function beginUpload(input: { kind: MediaKind; mime: string; size: number; owner: string | null; title?: string | null; still?: string | null }, now = new Date()): Promise<MediaRecord> {
  const mime = input.mime.toLowerCase()
  if (!(MEDIA_MIMES as readonly string[]).includes(mime)) throw new MediaError('type')
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > MEDIA_MAX_BYTES[input.kind]) throw new MediaError('size')
  const still = typeof input.still === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(input.still) && input.still.length <= STILL_MAX ? input.still : null
  const record: MediaRecord = {
    v: 1,
    id: `m_${randomBytes(16).toString('base64url')}`,
    kind: input.kind,
    mime,
    size: Math.round(input.size),
    chunks: Math.ceil(input.size / CHUNK_BYTES),
    owner: input.owner,
    title: typeof input.title === 'string' ? input.title.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 120) || null : null,
    still,
    state: 'uploading',
    createdAt: now.toISOString(),
    expiresAt: input.kind === 'form-check' ? new Date(now.getTime() + FORM_CHECK_DAYS * 86_400_000).toISOString() : null,
  }
  await kvSet(metaKey(record.id), record)
  return record
}

export async function getMedia(id: string): Promise<MediaRecord | null> {
  if (!isMediaId(id)) return null
  return (await kvGet<MediaRecord>(metaKey(id))) ?? null
}

/** One chunk, base64. Every chunk but the last is exactly `CHUNK_BYTES`. */
export async function putChunk(id: string, n: number, base64: string): Promise<void> {
  const record = await getMedia(id)
  if (!record || record.state !== 'uploading') throw new MediaError('missing')
  if (!Number.isInteger(n) || n < 0 || n >= record.chunks) throw new MediaError('chunk')
  const bytes = Buffer.from(base64, 'base64')
  const expected = n === record.chunks - 1 ? record.size - CHUNK_BYTES * (record.chunks - 1) : CHUNK_BYTES
  if (bytes.length !== expected) throw new MediaError('chunk')
  await kvSet(chunkKey(id, n), base64)
}

export async function finishUpload(id: string): Promise<MediaRecord> {
  const record = await getMedia(id)
  if (!record) throw new MediaError('missing')
  for (let n = 0; n < record.chunks; n++) if (!(await kvGet<string>(chunkKey(id, n)))) throw new MediaError('incomplete')
  const ready: MediaRecord = { ...record, state: 'ready' }
  await kvSet(metaKey(id), ready)
  return ready
}

/** Bytes `start`..`end` inclusive, from the chunks that hold them. */
export async function readRange(record: MediaRecord, start: number, end: number): Promise<Buffer> {
  const parts: Buffer[] = []
  for (let n = Math.floor(start / CHUNK_BYTES); n <= Math.floor(end / CHUNK_BYTES); n++) {
    const b64 = await kvGet<string>(chunkKey(record.id, n))
    if (!b64) throw new MediaError('incomplete')
    const chunk = Buffer.from(b64, 'base64')
    const from = n === Math.floor(start / CHUNK_BYTES) ? start - n * CHUNK_BYTES : 0
    const to = n === Math.floor(end / CHUNK_BYTES) ? end - n * CHUNK_BYTES + 1 : chunk.length
    parts.push(chunk.subarray(from, to))
  }
  return Buffer.concat(parts)
}

export async function deleteMedia(id: string): Promise<boolean> {
  const record = await getMedia(id)
  if (!record) return false
  for (let n = 0; n < record.chunks; n++) await kvDelete(chunkKey(id, n))
  await kvDelete(metaKey(id))
  return true
}

export async function listMedia(limit = 5000): Promise<MediaRecord[]> {
  return (await kvListPrefix<MediaRecord>('media:', limit)).map((r) => r.value).filter((m): m is MediaRecord => Boolean(m && m.v === 1))
}

/** A member's own clips, for their data export and deleting their account. */
export async function mediaOwnedBy(userId: string): Promise<MediaRecord[]> {
  return (await listMedia()).filter((m) => m.owner === userId)
}

/** Delete what's past its date (form checks after 30 days), and uploads abandoned for a day. */
export async function sweepExpiredMedia(now = new Date()): Promise<number> {
  let n = 0
  for (const m of await listMedia()) {
    const expired = m.expiresAt && Date.parse(m.expiresAt) <= now.getTime()
    const abandoned = m.state === 'uploading' && now.getTime() - Date.parse(m.createdAt) > 86_400_000
    if (expired || abandoned) {
      await deleteMedia(m.id)
      n++
    }
  }
  return n
}
