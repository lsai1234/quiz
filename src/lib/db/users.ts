/**
 * User accounts repository.
 *
 * A user signs up with email + password (scrypt hash in `password_hash`) or via
 * an OAuth provider (Google / Apple / Facebook / X). Provider logins are stored
 * in the `identities` table (`provider` + `provider_user_id` → `user_id`), so
 * one person can link several providers to a single account. Signing in with a
 * provider whose *verified* email matches an existing account links to it
 * rather than duplicating the person.
 *
 * Providers that don't return an email (X / Twitter) get a synthetic
 * `<provider>-<sub>@placeholder.invalid` address — unique, non-routable, and
 * detected by `hasRealEmail` so the UI never shows it.
 *
 * Engine-agnostic: statements go through SqlEngine (SQLite locally, Postgres
 * when DATABASE_URL is set).
 */
import crypto from 'crypto'
import { getEngine, now } from './engine'
import { PLACEHOLDER_EMAIL_DOMAIN, hasRealEmail } from './migrations'

export { hasRealEmail } from './migrations'

export interface UserRecord {
  id: string
  email: string
  name: string
  passwordHash: string | null
  picture: string | null
  createdAt: string
}

/** The shape safe to send to the browser (placeholder emails surface as null). */
export interface PublicUser {
  id: string
  email: string | null
  name: string
  picture: string | null
}

interface UserRow {
  id: string
  email: string
  name: string
  password_hash: string | null
  picture: string | null
  created_at: string
}

function fromRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    picture: row.picture,
    createdAt: row.created_at,
  }
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: hasRealEmail(user.email) ? user.email : null,
    name: user.name,
    picture: user.picture,
  }
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

const SELECT_USER = 'SELECT id, email, name, password_hash, picture, created_at FROM users'

export async function createUser(input: {
  email: string
  name?: string | null
  passwordHash?: string | null
  picture?: string | null
}): Promise<UserRecord> {
  const email = normaliseEmail(input.email)
  const user: UserRecord = {
    id: crypto.randomUUID(),
    email,
    name: input.name?.trim() || defaultName(email),
    passwordHash: input.passwordHash ?? null,
    picture: input.picture ?? null,
    createdAt: now(),
  }
  const db = await getEngine()
  await db.run(
    `INSERT INTO users (id, email, name, password_hash, picture, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user.id, user.email, user.name, user.passwordHash, user.picture, user.createdAt],
  )
  return user
}

function defaultName(email: string): string {
  return hasRealEmail(email) ? email.split('@')[0] : 'Member'
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const db = await getEngine()
  const row = await db.get<UserRow>(`${SELECT_USER} WHERE email = ?`, [normaliseEmail(email)])
  return row ? fromRow(row) : null
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const db = await getEngine()
  const row = await db.get<UserRow>(`${SELECT_USER} WHERE id = ?`, [id])
  return row ? fromRow(row) : null
}

/** The user linked to a provider identity, or null. */
export async function getUserByIdentity(provider: string, sub: string): Promise<UserRecord | null> {
  const db = await getEngine()
  const row = await db.get<UserRow>(
    `SELECT u.id, u.email, u.name, u.password_hash, u.picture, u.created_at
       FROM users u JOIN identities i ON i.user_id = u.id
      WHERE i.provider = ? AND i.provider_user_id = ?`,
    [provider, sub],
  )
  return row ? fromRow(row) : null
}

/** Attach a provider identity to an existing account (idempotent-ish). */
export async function addIdentity(userId: string, provider: string, sub: string): Promise<void> {
  const db = await getEngine()
  await db.run(
    `INSERT INTO identities (provider, provider_user_id, user_id, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (provider, provider_user_id) DO NOTHING`,
    [provider, sub, userId, now()],
  )
}

/** Update the stored avatar if the provider supplied a newer one. */
export async function updatePicture(userId: string, picture: string | null): Promise<void> {
  if (!picture) return
  const db = await getEngine()
  await db.run('UPDATE users SET picture = ? WHERE id = ?', [picture, userId])
}

export interface OAuthProfile {
  provider: string
  sub: string
  email: string | null
  emailVerified: boolean
  name?: string
  picture?: string | null
}

/**
 * Find-or-create the account behind an OAuth profile:
 *   1. an existing identity for (provider, sub) → that user;
 *   2. else an existing account with the same *verified* email → link + return;
 *   3. else a brand-new account (synthetic email when the provider gave none).
 */
export async function upsertOAuthUser(profile: OAuthProfile): Promise<UserRecord> {
  const existingByIdentity = await getUserByIdentity(profile.provider, profile.sub)
  if (existingByIdentity) {
    await updatePicture(existingByIdentity.id, profile.picture ?? null)
    return existingByIdentity
  }

  // Only link by email when the provider verified it — otherwise someone could
  // claim an unverified address and take over the matching account.
  if (profile.email && profile.emailVerified) {
    const existing = await getUserByEmail(profile.email)
    if (existing) {
      await addIdentity(existing.id, profile.provider, profile.sub)
      await updatePicture(existing.id, profile.picture ?? null)
      return existing
    }
  }

  // Only adopt the provider's email as the account's (unique) email when it's
  // verified — an unverified or missing email gets a non-routable placeholder,
  // so it can't collide with, or masquerade as, a real address.
  const email =
    profile.email && profile.emailVerified
      ? normaliseEmail(profile.email)
      : `${profile.provider}-${profile.sub}@${PLACEHOLDER_EMAIL_DOMAIN}`
  const user = await createUser({ email, name: profile.name, picture: profile.picture })
  try {
    await addIdentity(user.id, profile.provider, profile.sub)
  } catch (err) {
    // Identity collided (a concurrent link) — fall back to that user.
    const raced = await getUserByIdentity(profile.provider, profile.sub)
    if (raced) return raced
    throw err
  }
  return user
}
