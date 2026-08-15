/**
 * One-time password reset tokens for customer accounts.
 *
 * The link in the email carries a random opaque token; only its SHA-256 hash is
 * stored, exactly as sessions are — a leaked database must not hand anybody a
 * working reset link for every account in it.
 *
 * Rows are kept after they are spent rather than deleted, because "when did this
 * person last reset their password, and how many times did they try" is the
 * first question asked when an account is disputed. Expired-and-unused rows are
 * swept lazily on the next request for the same account.
 */
import crypto from 'crypto'
import { getEngine, now } from './engine'

export async function insertReset(input: {
  tokenHash: string
  userId: string
  expiresAt: string
}): Promise<void> {
  const db = await getEngine()
  await db.run(
    'INSERT INTO password_resets (token_hash, user_id, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, ?)',
    [input.tokenHash, input.userId, input.expiresAt, null, now()],
  )
}

/** An unused, unexpired token's account, or null. */
export async function findUsableReset(tokenHash: string): Promise<{ userId: string } | null> {
  const db = await getEngine()
  const row = await db.get<{ user_id: string }>(
    'SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at >= ?',
    [tokenHash, now()],
  )
  return row ? { userId: row.user_id } : null
}

/**
 * Burn a token, and report whether THIS caller was the one that burnt it.
 *
 * `WHERE used_at IS NULL` is what makes it single-use, and the guard is in SQL
 * because two tabs submitting the same link at once must not both succeed. The
 * engine reports no row count, so the winner is identified by stamping a value
 * unique to this call and reading back whose stamp survived — otherwise both
 * callers would see a non-null `used_at` and both believe they won.
 *
 * Lifted wholesale from `partners/repo.consumeInvite`, which solved this first.
 */
export async function consumeReset(tokenHash: string): Promise<boolean> {
  const db = await getEngine()
  const stamp = `${now()}#${crypto.randomUUID()}`
  await db.run('UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL', [
    stamp,
    tokenHash,
  ])
  const row = await db.get<{ used_at: string | null }>(
    'SELECT used_at FROM password_resets WHERE token_hash = ?',
    [tokenHash],
  )
  return row?.used_at === stamp
}

/**
 * Void every outstanding link for an account.
 *
 * Called when a new one is issued and again once one is spent, so a person who
 * taps "email me a link" three times cannot leave two live credentials in their
 * inbox — only the newest works, which is also what everyone expects.
 *
 * Stamped rather than deleted, and stamped distinguishably: a superseded link
 * was never used, and a deleted row would take an attempt out of the throttle's
 * count as well as out of the audit trail. `used_at IS NULL` is the only test
 * for usability, so a stamp of any shape retires it.
 */
export async function invalidateResetsFor(userId: string): Promise<void> {
  const db = await getEngine()
  await db.run(
    'UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL',
    [`superseded#${now()}`, userId],
  )
}

/** How many links this account has been sent since `sinceIso` — the throttle. */
export async function countResetsSince(userId: string, sinceIso: string): Promise<number> {
  const db = await getEngine()
  const row = await db.get<{ n: number | string }>(
    'SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at >= ?',
    [userId, sinceIso],
  )
  return Number(row?.n ?? 0)
}

/** Rows worth keeping for the audit trail, and no longer. */
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000

/**
 * Drop rows past their retention window.
 *
 * Swept lazily on each request, the way expired sessions are: nothing here is
 * worth a scheduled job, and a table of dead tokens that nobody ever prunes is
 * the other way this goes wrong.
 */
export async function sweepOldResets(): Promise<void> {
  const db = await getEngine()
  await db.run('DELETE FROM password_resets WHERE created_at < ?', [
    new Date(Date.now() - RETENTION_MS).toISOString(),
  ])
}
