/**
 * The marketing block, and the right to stop receiving it.
 *
 * Every email here is transactional — a receipt, a change to a plan, a payment
 * that failed — and every one of them also carries a short promotional strip at
 * the foot. That is a deliberate business decision and a legally loaded one, so
 * the rules it has to satisfy are worth stating where the code that satisfies
 * them lives:
 *
 *  • Under PECR (reg. 22) the "soft opt-in" lets us market similar products to
 *    someone who bought from us — **provided a simple means of refusing is given
 *    in every message.** So the opt-out link is not a nicety in the footer; it
 *    is the thing that makes the strip lawful, and it is rendered whether or not
 *    anyone remembers to ask for it.
 *  • Suppression applies to the **marketing strip only**. Someone who opts out
 *    still gets their receipts, their price-change notices and their failed
 *    payment emails — those are not marketing and cannot be unsubscribed from
 *    without breaking the service they paid for.
 *
 * The opt-out link carries an unguessable token rather than the address itself.
 * A link of the form `?email=someone@example.com` can be walked, and turning up
 * in someone's inbox with a URL that unsubscribes an arbitrary third party is
 * not a link, it is a vulnerability. Tokens are minted per address, stored, and
 * reused, so the same person always gets the same working link.
 *
 * Server-only — it touches the database.
 */
import { randomBytes } from 'crypto'
import { kvDelete, kvGet, kvSet } from '@/lib/db/kv'

const TOKEN_KEY = (email: string) => `notify:optout-token:${normalise(email)}`
const LOOKUP_KEY = (token: string) => `notify:optout-lookup:${token}`
const SUPPRESSED_KEY = (email: string) => `notify:marketing-optout:${normalise(email)}`

function normalise(email: string): string {
  return email.trim().toLowerCase()
}

interface OptOutRecord {
  email: string
  at: string
}

/**
 * The stable opt-out token for an address, minting one on first use.
 *
 * Deterministic from the caller's point of view — the same address always
 * resolves to the same token — so a link in an email sent last year still works
 * today, and a member who opted out from an old email is not offered a fresh
 * link that silently opts them back in.
 */
export async function optOutTokenFor(email: string): Promise<string> {
  const existing = await kvGet<string>(TOKEN_KEY(email))
  if (existing) return existing

  const token = randomBytes(18).toString('base64url')
  await kvSet(TOKEN_KEY(email), token)
  await kvSet(LOOKUP_KEY(token), normalise(email))
  return token
}

/** The address behind a token, or null when it is unknown or tampered with. */
export async function emailForOptOutToken(token: string): Promise<string | null> {
  if (!token || token.length < 8) return null
  return (await kvGet<string>(LOOKUP_KEY(token))) ?? null
}

/** Record that this address no longer wants the promotional strip. */
export async function suppressMarketing(email: string): Promise<void> {
  await kvSet<OptOutRecord>(SUPPRESSED_KEY(email), { email: normalise(email), at: new Date().toISOString() })
}

/** Put it back — the confirmation page offers this for a mis-click. */
export async function resumeMarketing(email: string): Promise<void> {
  await kvDelete(SUPPRESSED_KEY(email))
}

/**
 * Whether the marketing strip may be included for this address.
 *
 * Fails **closed on the marketing and open on the email**: a database that
 * cannot answer means the strip is dropped and the receipt still goes out. The
 * transactional content is what the member is owed; the promotion is what we
 * would like to add.
 */
export async function marketingSuppressed(email: string | null | undefined): Promise<boolean> {
  if (!email) return true
  try {
    const record = await kvGet<OptOutRecord | null>(SUPPRESSED_KEY(email))
    return record != null
  } catch (err) {
    console.error('[notify] could not read the marketing opt-out list:', err)
    return true
  }
}

/** The link that turns the strip off, for the footer of every email. */
export async function optOutUrl(baseUrl: string, email: string): Promise<string> {
  const token = await optOutTokenFor(email)
  return `${baseUrl.replace(/\/+$/, '')}/api/notify/marketing-opt-out?t=${encodeURIComponent(token)}`
}
