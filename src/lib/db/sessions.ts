/**
 * Database-backed login sessions (hub / customer accounts).
 *
 * The browser cookie holds a random opaque token; only its SHA-256 hash is
 * stored, so a leaked database can't be replayed as live sessions. Expired
 * rows are swept lazily on lookup.
 */
import crypto from 'crypto'
import { getDb, now } from './client'
import { getUserById, type UserRecord } from './users'

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  getDb()
    .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), userId, now(), expiresAt.toISOString())
  return { token, expiresAt }
}

/** Resolve a cookie token to its user, or null when missing/expired. */
export async function getUserForSession(token: string | undefined | null): Promise<UserRecord | null> {
  if (!token) return null
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now())
  const row = db
    .prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at >= ?')
    .get(hashToken(token), now()) as { user_id: string } | undefined
  if (!row) return null
  return getUserById(row.user_id)
}

export async function deleteSession(token: string | undefined | null): Promise<void> {
  if (!token) return
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
}
