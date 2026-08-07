/**
 * Founders Hub auth — per-founder accounts (mock-first).
 *
 * Accounts are seeded from the environment (FOUNDER_1_EMAIL / FOUNDER_1_PASSWORD,
 * FOUNDER_2_*, … up to FOUNDER_5_*). When none are configured we fall back to two
 * demo founders so the hub works out of the box in development — mirroring how
 * ADMIN_PASSWORD used to default to "chrgd-admin". A legacy ADMIN_PASSWORD, if set,
 * is kept as an extra "admin" account so existing setups keep working.
 *
 * The session cookie stores an opaque per-account token (a salted hash of the
 * credentials) rather than the password itself, and the token maps back to the
 * signed-in founder for display/attribution. Server-only (uses node crypto).
 *
 * Upgrade path: SSO, if the team ever outgrows per-founder accounts.
 */
import crypto from 'crypto'

export const PORTAL_COOKIE = 'portal_session'

const MAX_ACCOUNTS = 5

export interface FounderAccount {
  email: string
  name: string
}

interface RawAccount extends FounderAccount {
  password: string
}

/** All configured accounts (founders from env, demo fallback, legacy admin). */
function rawAccounts(): RawAccount[] {
  const accounts: RawAccount[] = []

  for (let i = 1; i <= MAX_ACCOUNTS; i++) {
    const email = process.env[`FOUNDER_${i}_EMAIL`]
    const password = process.env[`FOUNDER_${i}_PASSWORD`]
    if (email && password) {
      accounts.push({
        email: email.trim().toLowerCase(),
        password,
        name: process.env[`FOUNDER_${i}_NAME`]?.trim() || email.split('@')[0],
      })
    }
  }

  // Demo founders so the hub is usable without any env config (dev only).
  if (accounts.length === 0) {
    accounts.push(
      { email: 'founder1@chrgd.dev', password: 'chrgd-founder-1', name: 'Founder One' },
      { email: 'founder2@chrgd.dev', password: 'chrgd-founder-2', name: 'Founder Two' },
    )
  }

  // Legacy shared password — keep it working as an "admin" account if present.
  if (process.env.ADMIN_PASSWORD) {
    accounts.push({ email: 'admin@chrgd.dev', password: process.env.ADMIN_PASSWORD, name: 'Admin' })
  }

  return accounts
}

/** Opaque session token derived from the credentials (cookie isn't the password). */
function tokenFor(account: { email: string; password: string }): string {
  return crypto
    .createHash('sha256')
    .update(`chrgd-founder:${account.email}:${account.password}`)
    .digest('hex')
}

/** The list of accounts that may sign in, without their passwords. */
export function listFounders(): FounderAccount[] {
  return rawAccounts().map(({ email, name }) => ({ email, name }))
}

/**
 * Verify an email + password pair. Returns the matched founder (sans password)
 * and the session token to store, or null when the credentials don't match.
 */
export function verifyFounder(
  email: string,
  password: string,
): { founder: FounderAccount; token: string } | null {
  if (typeof email !== 'string' || typeof password !== 'string') return null
  const e = email.trim().toLowerCase()
  const match = rawAccounts().find((a) => a.email === e && a.password === password)
  if (!match) return null
  return { founder: { email: match.email, name: match.name }, token: tokenFor(match) }
}

/** Resolve a session token back to the founder it belongs to, or null. */
export function founderForToken(token: string | undefined | null): FounderAccount | null {
  if (!token) return null
  const match = rawAccounts().find((a) => tokenFor(a) === token)
  return match ? { email: match.email, name: match.name } : null
}

/** True when the token belongs to a valid account. */
export function isAuthed(token: string | undefined | null): boolean {
  return founderForToken(token) !== null
}
