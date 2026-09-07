import { createHash } from 'crypto'
import { getEngine, now } from './engine'

/**
 * Pictures a founder uploads rather than links to.
 *
 * ── Why an upload exists at all ─────────────────────────────────────────────
 * Every surface with a photograph on it took a URL, which quietly assumes the
 * picture is already on the internet. For a supplier's product that is true —
 * PowerBody host their own. For a bundle it is not: the photograph of a session
 * is one somebody took on a phone, and "put it on a host first, then paste the
 * link" is the step at which a bundle ships with no picture.
 *
 * ── One table, namespaced ids ───────────────────────────────────────────────
 * `id` is "<kind>:<subject>" — `bundle:leg-day-loading`. One table serves every
 * surface that grows an uploader, rather than a table per surface, because the
 * schema is the same each time and only the key changes.
 *
 * Bytes live in the column, the same call `share_card_art` and `shop_banners`
 * made: a blob store is a second system to operate, authenticate and have go
 * down, and this is a handful of images. See migration v22.
 *
 * ── Two reads, deliberately separate ────────────────────────────────────────
 * `listFounderImages` returns metadata; `readFounderImage` returns the bytes.
 * The editor lists what exists on every load and only the image route wants the
 * data, so one "select *" would ship megabytes to draw a status line.
 *
 * Server-only.
 */

export interface FounderImageMeta {
  id: string
  mime: string
  width: number
  height: number
  bytes: number
  /** Content hash. Goes in the image URL, so a replacement busts its own cache. */
  version: string
  updatedAt: string
}

export interface FounderImage extends FounderImageMeta {
  /** Base64, no data-URI prefix. */
  data: string
}

interface Row {
  id: string
  mime: string
  data: string
  width: number
  height: number
  bytes: number
  version: string
  updated_at: string
}

/**
 * A key that cannot escape its namespace or a URL.
 *
 * The id is a path segment in the public image route, so it is restricted to
 * what a slug and a prefix can produce. Anything else is refused rather than
 * sanitised: a silently rewritten key is an image saved where nothing will look
 * for it.
 */
const ID = /^[a-z0-9][a-z0-9-]{0,63}:[a-z0-9][a-z0-9._-]{0,127}$/

export function isFounderImageId(id: string): boolean {
  return ID.test(id)
}

/** The id an uploaded picture for a bundle is stored under. */
export function bundleImageId(slug: string): string {
  return `bundle:${slug}`
}

function meta(row: Row): FounderImageMeta {
  return {
    id: row.id,
    mime: row.mime,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    bytes: Number(row.bytes) || 0,
    version: row.version,
    updatedAt: row.updated_at,
  }
}

/** Metadata for every uploaded image under a prefix ("bundle:"). Never the bytes. */
export async function listFounderImages(prefix = ''): Promise<FounderImageMeta[]> {
  const db = await getEngine()
  const rows = await db.all<Row>(
    "SELECT id, mime, '' AS data, width, height, bytes, version, updated_at FROM founder_images",
  )
  return rows.filter((r) => r.id.startsWith(prefix)).map(meta)
}

/** One image, bytes included. */
export async function readFounderImage(id: string): Promise<FounderImage | null> {
  if (!isFounderImageId(id)) return null
  const db = await getEngine()
  const row = await db.get<Row>('SELECT * FROM founder_images WHERE id = ?', [id])
  return row ? { ...meta(row), data: row.data } : null
}

/**
 * Store an image against an id, replacing whatever was there.
 *
 * The version is a content hash rather than a counter, so re-uploading the same
 * file does not invalidate a cache that is already correct, and two environments
 * handed the same picture agree on its URL.
 */
export async function putFounderImage(input: {
  id: string
  mime: string
  /** Base64, no data-URI prefix. */
  data: string
  width: number
  height: number
}): Promise<FounderImageMeta | null> {
  if (!isFounderImageId(input.id)) return null

  const version = createHash('sha256').update(input.data).digest('hex').slice(0, 16)
  const bytes = Math.floor((input.data.length * 3) / 4)
  const stamp = now()

  const db = await getEngine()
  // Delete-then-insert rather than an upsert: `ON CONFLICT` is spelled
  // differently enough across SQLite and Postgres that one statement cannot
  // serve both, and this table has one writer.
  await db.run('DELETE FROM founder_images WHERE id = ?', [input.id])
  await db.run(
    `INSERT INTO founder_images (id, mime, data, width, height, bytes, version, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.id, input.mime, input.data, input.width, input.height, bytes, version, stamp],
  )

  return { id: input.id, mime: input.mime, width: input.width, height: input.height, bytes, version, updatedAt: stamp }
}

/** Remove an uploaded image. Idempotent. */
export async function deleteFounderImage(id: string): Promise<void> {
  if (!isFounderImageId(id)) return
  const db = await getEngine()
  await db.run('DELETE FROM founder_images WHERE id = ?', [id])
}

/** The public URL an uploaded image is served at, cache-busted by its content. */
export function founderImageUrl(meta: Pick<FounderImageMeta, 'id' | 'version'>): string {
  return `/api/images/${encodeURIComponent(meta.id)}?v=${meta.version}`
}
