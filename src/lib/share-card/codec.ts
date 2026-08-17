import { SHARE_PAYLOAD_VERSION, type ShareCardPayload } from './types'

/**
 * The payload, in a URL.
 *
 * This is the stateless half of the storage decision (`docs/SHARE_CARD_BLUEPRINT.md`
 * §3.5): with a database, a card is a ten-character token and the payload is a
 * row; without one — mock mode, local dev, a preview deploy with no
 * `DATABASE_URL` — the payload travels in the link itself. Long URL, no view
 * counting, everything else identical. The feature must not need Postgres to be
 * demoable, and the renderer must not care which half it is being fed.
 *
 * ── This is not a trust boundary ────────────────────────────────────────────
 * An encoded payload is user-controlled input: anyone can craft one and get the
 * renderer to draw it. That is *acceptable* for what this is — a vanity graphic
 * on a domain that also lets you type anything into a quiz — but it means two
 * things must stay true. The decoder validates shape before the renderer sees
 * it, so a malformed payload is a 400 rather than a stack trace. And nothing
 * downstream may treat a decoded payload as evidence of anything: a competition
 * entry is verified against a stored row, never against a link someone sent us.
 */

/** Guards against a decompression-bomb-shaped URL and against someone using the
 *  image route as free object storage. A real payload is well under 4KB. */
const MAX_ENCODED_BYTES = 8_192

export function encodeSharePayload(payload: ShareCardPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

/**
 * Decode and validate. Returns null for anything that is not a payload this
 * renderer can draw — including a version it does not know, because a future
 * card format rendered by an older deploy is a wrong image rather than an error,
 * and a wrong image is the failure mode with no symptom.
 */
export function decodeSharePayload(encoded: string): ShareCardPayload | null {
  if (!encoded || encoded.length > MAX_ENCODED_BYTES) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  return isShareCardPayload(parsed) ? parsed : null
}

const isString = (v: unknown): v is string => typeof v === 'string'

function isShareCardPayload(value: unknown): value is ShareCardPayload {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>

  if (p.v !== SHARE_PAYLOAD_VERSION) return false
  if (!isString(p.stackName) || !p.stackName.trim()) return false
  if (!isString(p.archetype)) return false
  if (!isString(p.level) || !isString(p.createdAt)) return false
  if (typeof p.drinksMode !== 'boolean') return false
  if (p.fitScore !== null && typeof p.fitScore !== 'number') return false

  if (!Array.isArray(p.lineup) || !p.lineup.every(isLineupEntry)) return false
  if (!Array.isArray(p.coverage) || !p.coverage.every(isCoverageEntry)) return false
  if (!Array.isArray(p.focusAreas) || !p.focusAreas.every(isFocusArea)) return false

  if (p.firstName !== undefined && !isString(p.firstName)) return false
  if (p.heroImage !== undefined && !isString(p.heroImage)) return false
  if (p.artKey !== undefined && !isString(p.artKey)) return false
  if (p.code !== undefined && !isString(p.code)) return false

  return true
}

function isLineupEntry(v: unknown): boolean {
  const e = v as Record<string, unknown>
  return !!e && isString(e.slot) && isString(e.product) && isString(e.reason)
}

function isCoverageEntry(v: unknown): boolean {
  const e = v as Record<string, unknown>
  return !!e && isString(e.label) && typeof e.score === 'number' && typeof e.targeted === 'boolean'
}

function isFocusArea(v: unknown): boolean {
  const e = v as Record<string, unknown>
  return !!e && isString(e.label) && isString(e.glyph)
}
