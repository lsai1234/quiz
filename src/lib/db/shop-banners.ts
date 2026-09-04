import { createHash, randomUUID } from 'crypto'
import { getEngine, now } from './engine'
import type { ShopBannerInput, ShopBannerMeta } from '@/lib/shop/banners'

/**
 * The shop's hero artwork, as uploaded from the Founders Hub.
 *
 * ── One row per placement ───────────────────────────────────────────────────
 * `slot` names a fixed position in the shop's layout (see
 * `@/lib/shop/placements`), and a placement holds one picture. Saving to a slot
 * REPLACES whatever was there — a founder swapping the masthead is not building
 * a history of mastheads, and a table that quietly accumulates the last six
 * pictures nobody can see is a table that eventually surprises somebody.
 *
 * The schema does not enforce that with a unique index, on purpose: see
 * migration v19. It is enforced here, where it can be done without a migration
 * that fails on a live database.
 *
 * ── Two reads, deliberately separate ────────────────────────────────────────
 * `listBanners` returns metadata only; `readBanner` returns the bytes. The
 * settings screen lists every placement on each poll and the shop wants the
 * ones it is about to draw, so a single "select *" would ship megabytes of
 * base64 to render a status line. This is the same split `share-card-art`
 * makes, for the same reason.
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
  slot: string
  updated_at: string
}

const COLUMNS =
  'id, mime, width, height, bytes, version, headline, subhead, href, alt, active, slot, updated_at'

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
    slot: row.slot,
    updatedAt: row.updated_at,
  }
}

/** Every placement that has artwork. Metadata only. */
export async function listBanners(): Promise<ShopBannerMeta[]> {
  const engine = await getEngine()
  const rows = await engine.all<Omit<Row, 'data'>>(
    `SELECT ${COLUMNS} FROM shop_banners ORDER BY slot ASC, updated_at ASC`,
  )
  return rows.map(meta)
}

/** One banner's bytes, for the image route. */
export async function readBanner(id: string): Promise<ShopBanner | null> {
  const engine = await getEngine()
  const row = await engine.get<Row>('SELECT * FROM shop_banners WHERE id = ?', [id])
  return row ? { ...meta(row), data: row.data } : null
}

/** What is currently in a placement, bytes included. */
export async function readSlot(slot: string): Promise<ShopBanner | null> {
  const engine = await getEngine()
  const row = await engine.get<Row>(
    'SELECT * FROM shop_banners WHERE slot = ? ORDER BY updated_at DESC',
    [slot],
  )
  return row ? { ...meta(row), data: row.data } : null
}

export interface PutBannerInput extends ShopBannerInput {
  /** Base64, no data-URI prefix. Omit to keep the artwork already in the slot. */
  data?: string
  mime?: string
  width?: number
  height?: number
}

/**
 * Put artwork in a placement, replacing whatever is there.
 *
 * The image is optional, which is the point of splitting the copy from the art:
 * changing a headline must not require re-uploading a megabyte, and re-uploading
 * art must not silently reset the copy.
 *
 * `version` is a hash of the bytes, so it only changes when the artwork does —
 * which is what makes the image URL safe to cache forever.
 */
export async function putBanner(input: PutBannerInput): Promise<ShopBannerMeta> {
  const engine = await getEngine()
  const stamp = now()
  const existing = await readSlot(input.slot)

  const data = input.data ?? existing?.data
  if (!data) throw new Error(`No artwork for ${input.slot}, and none supplied`)
  const mime = input.mime ?? existing?.mime
  if (!mime) throw new Error(`No image type for ${input.slot}`)

  const version = input.data
    ? createHash('sha256').update(input.data).digest('hex').slice(0, 16)
    : (existing?.version ?? '')

  /*
    Replace rather than update in place. The row is identified by its slot, not
    by an id the caller has to hold on to, and deleting first is what makes
    "one picture per placement" true even for a database that came through v19
    with two rows already defaulted into the same slot.
  */
  await engine.run('DELETE FROM shop_banners WHERE slot = ?', [input.slot])

  const id = randomUUID()
  const bytes = Buffer.byteLength(data, 'base64')
  await engine.run(
    `INSERT INTO shop_banners
       (id, mime, data, width, height, bytes, version, headline, subhead, href, alt, active, slot, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, mime, data,
      input.width ?? existing?.width ?? 0,
      input.height ?? existing?.height ?? 0,
      bytes, version,
      input.headline, input.subhead, input.href, input.alt,
      input.active ? 1 : 0, input.slot, 0, stamp, stamp,
    ],
  )

  return {
    id, mime,
    width: input.width ?? existing?.width ?? 0,
    height: input.height ?? existing?.height ?? 0,
    bytes, version,
    headline: input.headline, subhead: input.subhead, href: input.href, alt: input.alt,
    active: input.active, slot: input.slot, updatedAt: stamp,
  }
}

/** Empty a placement. The shop closes up around it — see `placements.ts`. */
export async function clearSlot(slot: string): Promise<void> {
  const engine = await getEngine()
  await engine.run('DELETE FROM shop_banners WHERE slot = ?', [slot])
}
