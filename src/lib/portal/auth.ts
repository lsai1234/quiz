/**
 * Founders Hub auth — per-founder accounts (mock-first).
 *
 * Accounts are seeded from the environment (FOUNDER_1_EMAIL / FOUNDER_1_PASSWORD,
 * FOUNDER_2_*, … up to FOUNDER_5_*). When none are configured we fall back to two
 * demo founders so the hub works out of the box in development — but never in a
 * production build, where an unconfigured hub admits nobody rather than
 * everybody. A legacy ADMIN_PASSWORD, if set, is kept as an extra "admin"
 * account so existing setups keep working.
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

/** The out-of-the-box accounts. Their passwords are printed on the sign-in screen. */
const DEMO_FOUNDERS: RawAccount[] = [
  { email: 'founder1@chrgd.dev', password: 'chrgd-founder-1', name: 'Founder One' },
  { email: 'founder2@chrgd.dev', password: 'chrgd-founder-2', name: 'Founder Two' },
]

/**
 * Whether the demo founders may sign in. Never in a production build.
 *
 * These credentials are in the repo, in `.env.example`, and rendered on the
 * sign-in page itself — they are a convenience for `npm run dev`, not a
 * fallback. Accepting them in production would leave the Founders Hub open to
 * anyone who loads the page, on the domain we are actively promoting, with the
 * password printed underneath the form. A deploy that forgets `FOUNDER_1_*` now
 * lets nobody in, which is the safe way to be wrong.
 */
function demoAccountsAllowed(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/** Accounts configured for real — env founders plus the legacy shared admin. */
function configuredAccounts(): RawAccount[] {
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

  // Legacy shared password — keep it working as an "admin" account if present.
  if (process.env.ADMIN_PASSWORD) {
    accounts.push({ email: 'admin@chrgd.dev', password: process.env.ADMIN_PASSWORD, name: 'Admin' })
  }

  return accounts
}

/** All accounts that may sign in right now (configured, plus demo where allowed). */
function rawAccounts(): RawAccount[] {
  const configured = configuredAccounts()
  if (configured.length > 0) return configured
  return demoAccountsAllowed() ? [...DEMO_FOUNDERS] : []
}

/**
 * How the hub is currently secured, for the sign-in screen to explain itself:
 *
 *   configured   — real accounts exist; sign in normally.
 *   demo         — none configured, but this isn't production, so the printed
 *                  demo credentials work.
 *   unconfigured — production with no `FOUNDER_*` and no `ADMIN_PASSWORD`.
 *                  Nobody can sign in until the env vars are set and deployed.
 */
export type FounderAuthMode = 'configured' | 'demo' | 'unconfigured'

export function founderAuthMode(): FounderAuthMode {
  if (configuredAccounts().length > 0) return 'configured'
  return demoAccountsAllowed() ? 'demo' : 'unconfigured'
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
