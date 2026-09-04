import { createHash, randomUUID } from 'crypto'
import { getEngine, now } from './engine'
import type { ShopBannerInput, ShopBannerMeta } from '@/lib/shop/banners'

/**
 * The shop's hero banners, as uploaded from the Founders Hub.
 *
 * ── Two reads, deliberately separate ────────────────────────────────────────
 * `listBanners` returns metadata only; `readBanner` returns the bytes. The
 * settings screen lists every banner on each poll and the shop wants the ones
 * it is about to draw, so a single "select *" would ship megabytes of base64 to
 * render a status line. This is the same split `share-card-art` makes, for the
 * same reason.
 *
 * Server-only.
 */

export interface ShopBanner extends ShopBannerMeta {
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
  headline: string
  subhead: string
  href: string
  alt: string
  active: number
  position: number
  updated_at: string
}

function meta(row: Omit<Row, 'data'>): ShopBannerMeta {
  return {
    id: row.id,
    mime: row.mime,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    bytes: Number(row.bytes) || 0,
    version: row.version,
    headline: row.headline,
    subhead: row.subhead,
    href: row.href,
    alt: row.alt,
    // SQLite has no boolean; Postgres returns one. Both survive this.
    active: !!row.active,
    position: Number(row.position) || 0,
    updatedAt: row.updated_at,
  }
}

/** Every banner, ordered as the shop would show them. Metadata only. */
export async function listBanners(): Promise<ShopBannerMeta[]> {
  const engine = await getEngine()
  const rows = await engine.all<Omit<Row, 'data'>>(
    `SELECT id, mime, width, height, bytes, version, headline, subhead, href, alt, active, position, updated_at
       FROM shop_banners
      ORDER BY position ASC, created_at ASC`,
  )
  return rows.map(meta)
}

/** One banner's bytes, for the image route. */
export async function readBanner(id: string): Promise<ShopBanner | null> {
  const engine = await getEngine()
  const row = await engine.get<Row>('SELECT * FROM shop_banners WHERE id = ?', [id])
  return row ? { ...meta(row), data: row.data } : null
}

export interface PutBannerInput extends ShopBannerInput {
  /** Base64, no data-URI prefix. Omit to keep the existing artwork. */
  data?: string
  mime?: string
  width?: number
  height?: number
}

/**
 * Create a banner, or update one.
 *
 * The artwork is optional on update, which is the point of splitting the copy
 * from the image: changing a headline must not require re-uploading a
 * megabyte, and re-uploading art must not silently reset the copy.
 *
 * `version` is a hash of the bytes, so it only changes when the artwork does —
 * which is what makes the image URL safe to cache forever.
 */
export async function putBanner(id: string | null, input: PutBannerInput): Promise<ShopBannerMeta> {
  const engine = await getEngine()
  const stamp = now()

  if (id) {
    const existing = await readBanner(id)
    if (!existing) throw new Error(`No banner ${id}`)
    const data = input.data ?? existing.data
    const version = input.data ? createHash('sha256').update(input.data).digest('hex').slice(0, 16) : existing.version
    await engine.run(
      `UPDATE shop_banners
          SET mime = ?, data = ?, width = ?, height = ?, bytes = ?, version = ?,
              headline = ?, subhead = ?, href = ?, alt = ?, active = ?, position = ?, updated_at = ?
        WHERE id = ?`,
      [
        input.mime ?? existing.mime, data,
        input.width ?? existing.width, input.height ?? existing.height,
        Buffer.byteLength(data, 'base64'), version,
        input.headline, input.subhead, input.href, input.alt,
        input.active ? 1 : 0, input.position, stamp, id,
      ],
    )
    return {
      ...existing,
      headline: input.headline, subhead: input.subhead, href: input.href, alt: input.alt,
      active: input.active, position: input.position,
      mime: input.mime ?? existing.mime,
      width: input.width ?? existing.width,
      height: input.height ?? existing.height,
      bytes: Buffer.byteLength(data, 'base64'),
      version, updatedAt: stamp,
    }
  }

  if (!input.data || !input.mime) throw new Error('A new banner needs artwork')
  const newId = randomUUID()
  const version = createHash('sha256').update(input.data).digest('hex').slice(0, 16)
  const bytes = Buffer.byteLength(input.data, 'base64')
  await engine.run(
    `INSERT INTO shop_banners
       (id, mime, data, width, height, bytes, version, headline, subhead, href, alt, active, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId, input.mime, input.data, input.width ?? 0, input.height ?? 0, bytes, version,
      input.headline, input.subhead, input.href, input.alt,
      input.active ? 1 : 0, input.position, stamp, stamp,
    ],
  )
  return {
    id: newId, mime: input.mime, width: input.width ?? 0, height: input.height ?? 0,
    bytes, version, headline: input.headline, subhead: input.subhead, href: input.href,
    alt: input.alt, active: input.active, position: input.position, updatedAt: stamp,
  }
}

export async function deleteBanner(id: string): Promise<void> {
  const engine = await getEngine()
  await engine.run('DELETE FROM shop_banners WHERE id = ?', [id])
}
