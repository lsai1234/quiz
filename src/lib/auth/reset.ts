/**
 * Forgotten passwords, customer realm.
 *
 * The same machinery the partner realm has had since `partners/auth.ts`: a
 * random opaque token, stored only as a hash, single-use, burnt in SQL before
 * anything is written, every session dropped afterwards. What differs is the
 * TTL and the enumeration rules, and both differences are deliberate:
 *
 *  • **One hour, not seven days.** A partner invite is an onboarding step that
 *    might sit in an inbox over a weekend. A reset is something somebody asked
 *    for while staring at a sign-in screen, so the window only has to cover
 *    "find the email" — and a link that lives for a week is a week in which a
 *    forwarded email, a shared laptop or a synced inbox is a live credential.
 *
 *  • **Nothing here says whether an account exists.** Every request gets the
 *    same answer whether the address is unknown, known, an OAuth-only account
 *    or over its throttle. A forgot-password form that answers honestly is a
 *    membership oracle: type an address, learn whether that person buys from us.
 *    The one thing the caller may distinguish is "no email provider is
 *    configured", which is a fact about this deployment and about nobody.
 *
 * Server-only.
 */
import crypto from 'crypto'
import { hashPassword, passwordProblem } from './password'
import {
  consumeReset,
  countResetsSince,
  findUsableReset,
  insertReset,
  invalidateResetsFor,
  sweepOldResets,
} from '@/lib/db/password-resets'
import { deleteSessionsForUser } from '@/lib/db/sessions'
import { getUserByEmail, getUserById, hasRealEmail, setPassword, type UserRecord } from '@/lib/db/users'
import { appBaseUrl, canSendFromHub } from '@/lib/notify'
import { sendPasswordChanged, sendPasswordReset } from '@/lib/notify/account'

/** How long a link lasts, and how it is described in the email. */
export const RESET_TTL_MS = 60 * 60 * 1000
const RESET_TTL_WORDS = '60 minutes'

/**
 * How many links one account can be sent in an hour.
 *
 * Three is enough for "it didn't arrive, try again" and short of enough to use
 * this endpoint to bury someone's inbox — the address belongs to a member who
 * did not ask for any of it, and we are the ones who would be sending it.
 */
const MAX_PER_HOUR = 3
const THROTTLE_WINDOW_MS = 60 * 60 * 1000

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function firstNameOf(user: UserRecord): string | null {
  const first = user.name?.trim().split(/\s+/)[0]
  return first && first.length > 0 ? first : null
}

/**
 * What actually happened, for the server log only.
 *
 * The route collapses everything except `unavailable` into one response. This
 * exists because "no reset email has left this deployment in a fortnight" should
 * be answerable from the logs without guessing which of four things went wrong.
 */
export type ResetRequestOutcome =
  /** A link is on its way. */
  | 'sent'
  /** No such account, or one with no real address to send to. */
  | 'unknown'
  /** Over the hourly limit. Nothing sent, same answer to the browser. */
  | 'throttled'
  /** A provider exists but refused it. */
  | 'failed'
  /** No email provider is configured, so resets cannot work here at all. */
  | 'unavailable'

/**
 * Ask for a reset link.
 *
 * Note what is NOT guarded: an account with `password_hash` null, i.e. one that
 * has only ever signed in with Google. Sending them a link is right, not a bug —
 * the token proves control of the mailbox, which is the same thing Google was
 * vouching for. They come out the other side with a password AND their provider
 * button, which is strictly better than the alternative of telling them, on a
 * screen designed to reveal nothing, that this address uses Google.
 */
export async function requestPasswordReset(email: string): Promise<ResetRequestOutcome> {
  if (!canSendFromHub()) return 'unavailable'

  const user = await getUserByEmail(email ?? '')
  // A synthetic `@placeholder.invalid` address belongs to a provider that never
  // gave us a real one. There is nowhere to send this, and attempting it would
  // bounce against our own sending reputation.
  if (!user || !hasRealEmail(user.email)) return 'unknown'

  await sweepOldResets()

  const since = new Date(Date.now() - THROTTLE_WINDOW_MS).toISOString()
  if ((await countResetsSince(user.id, since)) >= MAX_PER_HOUR) return 'throttled'

  // Only the newest link works. Someone who taps the button three times should
  // not be leaving live credentials scattered through their inbox.
  await invalidateResetsFor(user.id)

  const token = crypto.randomBytes(32).toString('base64url')
  await insertReset({
    tokenHash: hashToken(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
  })

  const sent = await sendPasswordReset({
    userId: user.id,
    email: user.email,
    firstName: firstNameOf(user),
    resetUrl: resetUrlFor(token),
    expiresIn: RESET_TTL_WORDS,
  })
  return sent ? 'sent' : 'failed'
}

/** The link that goes in the email. */
export function resetUrlFor(token: string): string {
  return `${appBaseUrl()}/myhub/reset-password?token=${encodeURIComponent(token)}`
}

/**
 * Whose link this is, without spending it.
 *
 * A page load must not be able to burn a token, or an email client's link
 * preview would lock somebody out of their own account before they ever
 * clicked — the same trap `partner/set-password` documents.
 */
export async function accountForResetToken(
  token: string,
): Promise<{ name: string; email: string } | null> {
  if (!token) return null
  const reset = await findUsableReset(hashToken(token))
  if (!reset) return null
  const user = await getUserById(reset.userId)
  return user ? { name: user.name, email: user.email } : null
}

export type ResetResult = { ok: true; user: UserRecord } | { ok: false; reason: string }

/** One message for every way a link can be no good — it is all the same to whoever holds it. */
const DEAD_LINK = 'That link has expired or has already been used. Ask for a new one.'

/**
 * Spend a link and set the password.
 *
 * The order matters. The token is burnt BEFORE the password is written and only
 * the caller that burnt it continues, so a link opened in two tabs, forwarded,
 * or replayed cannot set a password twice. Then every session for the account is
 * dropped: the reason to reset a password is that somebody else may know the old
 * one, and whoever that is may already be signed in.
 */
export async function resetPasswordWithToken(token: string, password: string): Promise<ResetResult> {
  const weak = passwordProblem(password)
  if (weak) return { ok: false, reason: weak }

  const tokenHash = hashToken(token ?? '')
  const reset = await findUsableReset(tokenHash)
  if (!reset) return { ok: false, reason: DEAD_LINK }
  if (!(await consumeReset(tokenHash))) return { ok: false, reason: DEAD_LINK }

  const user = await getUserById(reset.userId)
  if (!user) return { ok: false, reason: 'That account no longer exists.' }

  await setPassword(user.id, hashPassword(password))
  // Any other outstanding link is now stale — a second email sitting in the
  // inbox must not still be able to change the password we just set.
  await invalidateResetsFor(user.id)
  await deleteSessionsForUser(user.id)

  // After the fact, and never allowed to fail the reset: this is the notice
  // that catches a takeover, not part of performing one.
  await sendPasswordChanged({ userId: user.id, email: user.email, firstName: firstNameOf(user) })

  return { ok: true, user }
}
