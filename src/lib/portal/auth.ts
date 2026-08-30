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

/** How long a founder's session lasts before they sign in again. */
export const PORTAL_SESSION_TTL_MS = 12 * 60 * 60 * 1000

/**
 * The signing key for a founder's session token.
 *
 * Derived from the account's own password plus a server secret, which gives
 * revocation for free: changing `FOUNDER_n_PASSWORD` changes the key and every
 * token issued under the old one stops verifying, with no session table to
 * clear.
 *
 * `PORTAL_TOKEN_SECRET` is optional. Without it the key still depends on the
 * password, which is not public — but setting it means a token cannot be forged
 * by someone who has only learned a password, and it should be set in
 * production.
 */
function signingKey(account: { email: string; password: string }): Buffer {
  return crypto.createHash('sha256')
    .update(`chrgd-founder-v2:${process.env.PORTAL_TOKEN_SECRET ?? ''}:${account.email}:${account.password}`)
    .digest()
}

/**
 * A fresh session token: `email.issuedAt.nonce.signature`.
 *
 * This replaces a deterministic `sha256(email:password)`, which was a
 * password-equivalent that never changed. It could not be revoked without
 * changing the password, it was identical across every device and every login,
 * and anything that had ever logged it — a proxy, a crash report, a shared
 * screen — held a credential valid indefinitely. The console this guards can
 * read every member's health data, so that was the weakest authentication in
 * the app protecting the most sensitive thing in it.
 *
 * A nonce makes each login distinct, the timestamp makes it expire, and the
 * signature is what stops any of it being edited by the holder.
 */
function issueToken(account: { email: string; password: string }): string {
  const issuedAt = Date.now().toString(36)
  const nonce = crypto.randomBytes(16).toString('hex')
  // base64url, not the raw address: `.` is the field separator and every email
  // here ends in one (`ada@chrgd.dev`), so an unencoded address silently splits
  // the token into more fields than it has.
  const body = `${Buffer.from(account.email, 'utf8').toString('base64url')}.${issuedAt}.${nonce}`
  return `${body}.${sign(body, signingKey(account))}`
}

function sign(body: string, key: Buffer): string {
  return crypto.createHmac('sha256', key).update(body).digest('hex')
}

/** Compare two strings without leaking their difference through timing. */
function sameSecret(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  // timingSafeEqual throws on a length mismatch, which would itself be an
  // oracle — hash first so both sides are always 32 bytes.
  const ah = crypto.createHash('sha256').update(ab).digest()
  const bh = crypto.createHash('sha256').update(bb).digest()
  return crypto.timingSafeEqual(ah, bh)
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

  // The email is matched normally — it is not a secret, and which addresses can
  // sign in is already on the login screen. The PASSWORD comparison is the one
  // that must not leak how much of a guess was right, so it is constant-time
  // and runs even when no account matched, so a wrong email and a wrong
  // password take the same time to refuse.
  const match = rawAccounts().find((a) => a.email === e)
  const expected = match?.password ?? crypto.randomBytes(32).toString('hex')
  const ok = sameSecret(expected, password)
  if (!match || !ok) return null

  return { founder: { email: match.email, name: match.name }, token: issueToken(match) }
}

/**
 * Resolve a session token back to the founder it belongs to, or null.
 *
 * Verifies the signature against the named account's key and checks the age.
 * A token whose account has gone, whose password has changed, or which is past
 * its TTL resolves to nobody.
 */
export function founderForToken(token: string | undefined | null): FounderAccount | null {
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [rawEmail, issuedAt, nonce, signature] = parts

  let email: string
  try {
    email = Buffer.from(rawEmail, 'base64url').toString('utf8')
  } catch {
    return null
  }

  const account = rawAccounts().find((a) => a.email === email)
  if (!account) return null

  const body = `${rawEmail}.${issuedAt}.${nonce}`
  if (!sameSecret(sign(body, signingKey(account)), signature)) return null

  const issued = parseInt(issuedAt, 36)
  if (!Number.isFinite(issued) || Date.now() - issued > PORTAL_SESSION_TTL_MS) return null

  return { email: account.email, name: account.name }
}

/** True when the token belongs to a valid account. */
export function isAuthed(token: string | undefined | null): boolean {
  return founderForToken(token) !== null
}
