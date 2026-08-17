import { createHash } from 'crypto'
import { getEngine, now } from './engine'
import { ART_KEYS, type ArtKey } from '@/lib/share-card/art'

/**
 * The card's category photography, as uploaded from the Founders Hub.
 *
 * Six rows at most, one per art key. The bytes are in the column — see the v13
 * migration for why that beats a blob store at this size, and what changes if
 * the set ever grows.
 *
 * ── Two reads, deliberately separate ────────────────────────────────────────
 * `listArtUploads` returns metadata only. `readArtUpload` returns the bytes.
 * Splitting them is not tidiness: the settings screen lists six slots on every
 * poll and the renderer wants one image, so a single "select *" would ship
 * megabytes of base64 to draw a status line.
 *
 * Server-only.
 */

export interface ArtUploadMeta {
  key: ArtKey
  mime: string
  width: number
  height: number
  bytes: number
  /** Content hash. Goes in the image URL and the card's cache key. */
  version: string
  updatedAt: string
}

export interface ArtUpload extends ArtUploadMeta {
  /** Base64, no data-URI prefix. */
  data: string
}

interface Row {
  art_key: string
  mime: string
  data: string
  width: number
  height: number
  bytes: number
  version: string
  updated_at: string
}

function meta(row: Row): ArtUploadMeta {
  return {
    key: row.art_key as ArtKey,
    mime: row.mime,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    bytes: Number(row.bytes) || 0,
    version: row.version,
    updatedAt: row.updated_at,
  }
}

function isArtKey(value: string): value is ArtKey {
  return (ART_KEYS as string[]).includes(value)
}

/** What is uploaded, keyed by art key. Metadata only — never the bytes. */
export async function listArtUploads(): Promise<Partial<Record<ArtKey, ArtUploadMeta>>> {
  const db = await getEngine()
  const rows = await db.all<Row>(
    'SELECT art_key, mime, \'\' AS data, width, height, bytes, version, updated_at FROM share_card_art',
  )
  const out: Partial<Record<ArtKey, ArtUploadMeta>> = {}
  for (const row of rows) {
    if (isArtKey(row.art_key)) out[row.art_key] = meta(row)
  }
  return out
}

/** One image, bytes included. */
export async function readArtUpload(key: string): Promise<ArtUpload | null> {
  if (!isArtKey(key)) return null
  const db = await getEngine()
  const row = await db.get<Row>('SELECT * FROM share_card_art WHERE art_key = ?', [key])
  return row ? { ...meta(row), data: row.data } : null
}

/**
 * Store an image against a key, replacing whatever was there.
 *
 * The version is the content hash rather than a counter, so uploading the same
 * file twice does not invalidate every card that already carries it — and two
 * environments given the same file agree on the URL.
 */
export async function putArtUpload(input: {
  key: string
  mime: string
  /** Base64, no data-URI prefix. */
  data: string
  width: number
  height: number
}): Promise<ArtUploadMeta | null> {
  if (!isArtKey(input.key)) return null

  const version = createHash('sha256').update(input.data).digest('hex').slice(0, 16)
  const bytes = Math.floor((input.data.length * 3) / 4)
  const stamp = now()

  const db = await getEngine()
  // Written as delete-then-insert rather than an upsert: `ON CONFLICT` is
  // spelled differently enough across SQLite and Postgres that one statement
  // cannot serve both, and this table has one writer and six rows.
  await db.run('DELETE FROM share_card_art WHERE art_key = ?', [input.key])
  await db.run(
    `INSERT INTO share_card_art (art_key, mime, data, width, height, version, bytes, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.key, input.mime, input.data, input.width, input.height, version, bytes, stamp],
  )

  return {
    key: input.key,
    mime: input.mime,
    width: input.width,
    height: input.height,
    bytes,
    version,
    updatedAt: stamp,
  }
}

/** Reset a slot to the gradient stand-in. Idempotent. */
export async function deleteArtUpload(key: string): Promise<void> {
  if (!isArtKey(key)) return
  const db = await getEngine()
  await db.run('DELETE FROM share_card_art WHERE art_key = ?', [key])
}

/**
 * A version string covering the whole set.
 *
 * The card's cache key needs to change when *its* image changes, and the cheap
 * way to get that is one token derived from every row's version. Empty when
 * nothing is uploaded, so a card on placeholders has a stable key.
 */
export async function artSetVersion(): Promise<string> {
  const uploads = await listArtUploads()
  const parts = ART_KEYS.map((key) => uploads[key]?.version ?? '-').join('.')
  return parts === ART_KEYS.map(() => '-').join('.') ? '' : parts
}
