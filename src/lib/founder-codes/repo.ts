/**
 * Founder codes repository — the `founder_codes` table (migration v17).
 *
 * Same dialect-neutral `?`-placeholder style as every other repository here, so
 * it runs on SQLite and Postgres unchanged.
 *
 * Server-only.
 */
import crypto from 'crypto'
import { getEngine, now } from '@/lib/db/engine'
import type { FounderCode, FounderCodeKind } from './types'
import { founderCodeExpiry, normaliseFounderCode } from './codes'
import { newFounderCode } from './generate'

interface Row {
  code: string
  kind: string
  note: string | null
  created_by: string | null
  created_at: string
  expires_at: string
  claim_token: string | null
  claimed_at: string | null
  used_at: string | null
  order_id: string | null
  revoked_at: string | null
}

function toCode(row: Row): FounderCode {
  return {
    code: row.code,
    kind: row.kind as FounderCodeKind,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    claimToken: row.claim_token,
    claimedAt: row.claimed_at,
    usedAt: row.used_at,
    orderId: row.order_id,
    revokedAt: row.revoked_at,
  }
}

export async function getFounderCode(code: string): Promise<FounderCode | null> {
  const db = await getEngine()
  const row = await db.get<Row>('SELECT * FROM founder_codes WHERE code = ?', [normaliseFounderCode(code)])
  return row ? toCode(row) : null
}

/** Newest first. The hub shows a short history, not an archive. */
export async function listFounderCodes(limit = 50): Promise<FounderCode[]> {
  const db = await getEngine()
  const rows = await db.all<Row>('SELECT * FROM founder_codes ORDER BY created_at DESC LIMIT ?', [limit])
  return rows.map(toCode)
}

/**
 * Issue a code.
 *
 * Retries on the (vanishingly unlikely) collision rather than trusting 40 bits
 * blindly — an insert that silently overwrote a live code would transfer it to
 * a different founder mid-checkout.
 */
export async function createFounderCode(input: {
  kind: FounderCodeKind
  note?: string | null
  createdBy?: string | null
  now?: Date
}): Promise<FounderCode> {
  const db = await getEngine()
  const at = now()
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newFounderCode(input.kind)
    if (await getFounderCode(code)) continue
    const record: FounderCode = {
      code,
      kind: input.kind,
      note: input.note?.trim() || null,
      createdBy: input.createdBy ?? null,
      createdAt: at,
      expiresAt: founderCodeExpiry(input.now ?? new Date()),
      claimToken: null,
      claimedAt: null,
      usedAt: null,
      orderId: null,
      revokedAt: null,
    }
    await db.run(
      `INSERT INTO founder_codes (code, kind, note, created_by, created_at, expires_at, claim_token, claimed_at, used_at, order_id, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL)`,
      [record.code, record.kind, record.note, record.createdBy, record.createdAt, record.expiresAt],
    )
    return record
  }
  throw new Error('Could not allocate a founder code')
}

/**
 * Take the code, or find out somebody else has.
 *
 * `WHERE claim_token IS NULL` is the lock. Two checkouts racing for the same
 * code both run this; the second one's UPDATE matches no row, so the read-back
 * returns the first one's token and only that caller gets `true`. This is why
 * the column exists instead of a uses counter — `SqlEngine.run` returns no row
 * count on either engine, so "increment if under the cap" has no way to know
 * whether it did.
 *
 * Claimed BEFORE the order is created, deliberately. Claiming afterwards leaves
 * a window in which the same 100%-off code raises two free orders.
 */
export async function claimFounderCode(code: string): Promise<string | null> {
  const db = await getEngine()
  const token = crypto.randomBytes(16).toString('hex')
  await db.run('UPDATE founder_codes SET claim_token = ?, claimed_at = ? WHERE code = ? AND claim_token IS NULL', [
    token,
    now(),
    normaliseFounderCode(code),
  ])
  const row = await db.get<{ claim_token: string | null }>(
    'SELECT claim_token FROM founder_codes WHERE code = ?',
    [normaliseFounderCode(code)],
  )
  return row?.claim_token === token ? token : null
}

/** Hand the code back after a checkout that claimed it and then failed. */
export async function releaseFounderCode(code: string, token: string): Promise<void> {
  const db = await getEngine()
  await db.run(
    'UPDATE founder_codes SET claim_token = NULL, claimed_at = NULL WHERE code = ? AND claim_token = ?',
    [normaliseFounderCode(code), token],
  )
}

/**
 * Turn a claim into a redemption, against the order that spent it.
 *
 * `AND claim_token = ?` so a caller cannot mark a code used with somebody
 * else's claim — the same guard that makes the claim mean anything.
 */
export async function markFounderCodeUsed(code: string, token: string, orderId: string): Promise<void> {
  const db = await getEngine()
  await db.run(
    'UPDATE founder_codes SET used_at = ?, order_id = ? WHERE code = ? AND claim_token = ?',
    [now(), orderId, normaliseFounderCode(code), token],
  )
}

/** Kill a code by hand. Irreversible on purpose: reissue instead. */
export async function revokeFounderCode(code: string): Promise<void> {
  const db = await getEngine()
  await db.run('UPDATE founder_codes SET revoked_at = ? WHERE code = ? AND revoked_at IS NULL', [
    now(),
    normaliseFounderCode(code),
  ])
}
