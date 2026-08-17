import { getEngine, now } from './engine'
import { generateShareToken, normaliseToken } from '@/lib/share-card/token'
import type { ShareCardPayload } from '@/lib/share-card/types'

/**
 * Share cards.
 *
 * A card is a frozen snapshot of somebody's stack plus the short token that
 * addresses it. Nothing here re-derives anything: the payload goes in as JSON at
 * share time and comes back out unchanged, because a card is a public URL that
 * may sit in a story highlight for a year and everything it would re-derive from
 * moves underneath it. See `share-card/types.ts`.
 *
 * Server-only.
 */

export interface ShareCardRecord {
  token: string
  userId: string | null
  partnerCode: string | null
  payload: ShareCardPayload
  viewCount: number
  createdAt: string
  revokedAt: string | null
}

interface Row {
  token: string
  user_id: string | null
  partner_code: string | null
  payload: string
  view_count: number
  created_at: string
  revoked_at: string | null
}

function toRecord(row: Row): ShareCardRecord | null {
  try {
    return {
      token: row.token,
      userId: row.user_id,
      partnerCode: row.partner_code,
      payload: JSON.parse(row.payload) as ShareCardPayload,
      // Postgres returns bigint-ish counts as strings through some drivers.
      viewCount: Number(row.view_count) || 0,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    }
  } catch {
    // A row whose JSON will not parse is a row nothing can render. Treated as
    // missing rather than thrown, so one corrupt card cannot 500 the route that
    // serves every other one.
    return null
  }
}

/** How many times we will retry a token collision before giving up. */
const MAX_ATTEMPTS = 5

/**
 * Store a card and return its token.
 *
 * The collision retry is theatre at 32^10 — roughly one in a thousand billion
 * per card — but a primary-key violation surfacing as a 500 on the share button
 * is a worse outcome than three lines of loop.
 */
export async function createShareCard(input: {
  payload: ShareCardPayload
  userId?: string | null
  partnerCode?: string | null
}): Promise<ShareCardRecord> {
  const db = await getEngine()
  const payload = JSON.stringify(input.payload)
  const createdAt = now()

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const token = generateShareToken()
    const existing = await db.get<{ token: string }>('SELECT token FROM share_cards WHERE token = ?', [token])
    if (existing) continue

    await db.run(
      `INSERT INTO share_cards (token, user_id, partner_code, payload, view_count, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [token, input.userId ?? null, input.partnerCode ?? null, payload, createdAt],
    )

    return {
      token,
      userId: input.userId ?? null,
      partnerCode: input.partnerCode ?? null,
      payload: input.payload,
      viewCount: 0,
      createdAt,
      revokedAt: null,
    }
  }

  throw new Error('could not allocate a share token')
}

/**
 * Look a card up by the token as typed.
 *
 * Normalises first, so somebody reading a code off their own screenshot and
 * typing O for 0 still lands on the right card. A revoked card is not found:
 * taking a link down has to actually take it down.
 */
export async function getShareCard(token: string): Promise<ShareCardRecord | null> {
  const normalised = normaliseToken(token)
  if (!normalised) return null

  const db = await getEngine()
  const row = await db.get<Row>('SELECT * FROM share_cards WHERE token = ? AND revoked_at IS NULL', [normalised])
  return row ? toRecord(row) : null
}

/**
 * Count a view.
 *
 * Deliberately not part of `getShareCard`: the image route is fetched by every
 * unfurl bot that touches the link, and counting those would make a card that
 * nobody opened look like a card that travelled. Only the landing page calls
 * this.
 */
export async function recordShareCardView(token: string): Promise<void> {
  const normalised = normaliseToken(token)
  if (!normalised) return
  const db = await getEngine()
  await db.run(
    'UPDATE share_cards SET view_count = view_count + 1, last_seen_at = ? WHERE token = ? AND revoked_at IS NULL',
    [now(), normalised],
  )
}

/** Take a card down. Idempotent; the row and its history stay. */
export async function revokeShareCard(token: string): Promise<void> {
  const normalised = normaliseToken(token)
  if (!normalised) return
  const db = await getEngine()
  await db.run('UPDATE share_cards SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL', [now(), normalised])
}

/** Every card attributed to a partner code, newest first. */
export async function listShareCardsForPartner(partnerCode: string): Promise<ShareCardRecord[]> {
  const db = await getEngine()
  const rows = await db.all<Row>(
    'SELECT * FROM share_cards WHERE partner_code = ? ORDER BY created_at DESC',
    [partnerCode.trim().toUpperCase()],
  )
  return rows.map(toRecord).filter((r): r is ShareCardRecord => r !== null)
}

/** A year. Long enough that a card in a story highlight outlives the highlight. */
export const ANONYMOUS_CARD_TTL_MS = 365 * 24 * 60 * 60 * 1000

/**
 * Sweep anonymous cards past their life.
 *
 * Only cards with no account behind them: a card attached to a customer is that
 * customer's, and deleting it because a year passed is deleting something of
 * theirs on a schedule they never agreed to. Returns the number removed so the
 * daily job can report it.
 */
export async function sweepExpiredShareCards(
  ttlMs = ANONYMOUS_CARD_TTL_MS,
  clock: () => number = Date.now,
): Promise<number> {
  const db = await getEngine()
  const cutoff = new Date(clock() - ttlMs).toISOString()
  const doomed = await db.all<{ token: string }>(
    'SELECT token FROM share_cards WHERE user_id IS NULL AND created_at < ?',
    [cutoff],
  )
  if (doomed.length === 0) return 0
  await db.run('DELETE FROM share_cards WHERE user_id IS NULL AND created_at < ?', [cutoff])
  return doomed.length
}
