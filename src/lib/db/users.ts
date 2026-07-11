/**
 * User accounts repository.
 *
 * A user signs up with email + password (scrypt hash in `password_hash`),
 * with Google (`google_sub` holds the stable OIDC subject), or both — signing
 * in with Google using an email that already has a password account links the
 * two rather than duplicating the person.
 *
 * Async signatures even though better-sqlite3 is synchronous — this is the
 * Postgres-swap seam.
 */
import crypto from 'crypto'
import { getDb, now } from './client'

export interface UserRecord {
  id: string
  email: string
  name: string
  passwordHash: string | null
  googleSub: string | null
  picture: string | null
  createdAt: string
}

/** The shape safe to send to the browser. */
export interface PublicUser {
  id: string
  email: string
  name: string
  picture: string | null
}

interface UserRow {
  id: string
  email: string
  name: string
  password_hash: string | null
  google_sub: string | null
  picture: string | null
  created_at: string
}

function fromRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    googleSub: row.google_sub,
    picture: row.picture,
    createdAt: row.created_at,
  }
}

export function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, email: user.email, name: user.name, picture: user.picture }
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export async function createUser(input: {
  email: string
  name?: string | null
  passwordHash?: string | null
  googleSub?: string | null
  picture?: string | null
}): Promise<UserRecord> {
  const email = normaliseEmail(input.email)
  const user: UserRecord = {
    id: crypto.randomUUID(),
    email,
    name: input.name?.trim() || email.split('@')[0],
    passwordHash: input.passwordHash ?? null,
    googleSub: input.googleSub ?? null,
    picture: input.picture ?? null,
    createdAt: now(),
  }
  getDb()
    .prepare(
      `INSERT INTO users (id, email, name, password_hash, google_sub, picture, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(user.id, user.email, user.name, user.passwordHash, user.googleSub, user.picture, user.createdAt)
  return user
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const row = getDb()
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(normaliseEmail(email)) as UserRow | undefined
  return row ? fromRow(row) : null
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
  return row ? fromRow(row) : null
}

export async function getUserByGoogleSub(sub: string): Promise<UserRecord | null> {
  const row = getDb().prepare('SELECT * FROM users WHERE google_sub = ?').get(sub) as UserRow | undefined
  return row ? fromRow(row) : null
}

/** Attach a Google identity (and optional avatar) to an existing account. */
export async function linkGoogle(userId: string, sub: string, picture?: string | null): Promise<void> {
  getDb()
    .prepare('UPDATE users SET google_sub = ?, picture = COALESCE(?, picture) WHERE id = ?')
    .run(sub, picture ?? null, userId)
}
