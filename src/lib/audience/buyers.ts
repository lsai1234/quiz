/**
 * Customers joining the audience — the soft opt-in, and one identity per address.
 *
 * Server-only.
 *
 * PECR reg. 22(3) permits marketing similar products to somebody who has bought
 * from us, or negotiated to buy, **provided a simple means of refusing is given
 * in every message**. That is a different permission from the tick a prospect
 * gives on the quiz, and the difference is worth keeping straight in the data
 * rather than in somebody's head:
 *
 *  • It is narrower. "Similar products" is the limit, not "anything we send".
 *  • It is not a tick, so there is no statement to hash — the evidence is the
 *    order, and the record here points at the checkout that created it.
 *  • It can be withdrawn exactly as easily, through exactly the same one-click
 *    link, which is what makes relying on it lawful at all.
 *
 * Which means the one thing this must never do is **overwrite a real consent
 * with a weaker basis**. Somebody who ticked the box on the quiz and then bought
 * has given us both; recording the soft opt-in over the top would quietly
 * downgrade what we hold. So an existing opt-in is left alone.
 */
import { latestOptIn, normaliseEmail, recordMarketingConsent } from './consent'
import { linkLeadToUser, upsertLead } from './leads'
import { marketingSuppressed } from '@/lib/notify/marketing'

export interface SoftOptInInput {
  email: string | null | undefined
  userId: string
  firstName?: string | null
  track?: string | null
  primaryGoal?: string | null
  ip?: string | null
  userAgent?: string | null
}

/**
 * Record a buyer in the audience.
 *
 * Three things happen, in this order, and each is skippable without breaking
 * the next: the address is stored and tied to the account, the soft opt-in is
 * recorded if there is no stronger permission already, and nothing at all
 * happens for somebody who has opted out.
 */
export async function recordSoftOptIn(input: SoftOptInInput): Promise<void> {
  if (!input.email) return
  const email = normaliseEmail(input.email)

  await upsertLead({
    email,
    firstName: input.firstName ?? null,
    source: 'checkout',
    track: input.track ?? null,
    primaryGoal: input.primaryGoal ?? null,
    userId: input.userId,
  })
  await linkLeadToUser(email, input.userId)

  // Somebody who has said no stays a no. Buying something is not a fresh
  // permission to email them what they already refused.
  if (await marketingSuppressed(email)) return

  // A tick already on file is the stronger basis. Leave it.
  if (await latestOptIn(email)) return

  await recordMarketingConsent({
    email,
    action: 'opt-in',
    basis: 'soft-opt-in',
    source: 'checkout',
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    // No statement: they ticked nothing, and inventing one would put words in
    // their mouth. The order is the evidence.
    statement: null,
  })
}

/**
 * Tie an address we already hold to the account that has just signed in with it.
 *
 * Cheap and idempotent, so it can be called on every sign-in: it is what keeps
 * "one preference per address" true when somebody takes the quiz first and makes
 * an account weeks later.
 */
export async function linkAccountAddress(email: string | null | undefined, userId: string): Promise<void> {
  if (!email) return
  try {
    await linkLeadToUser(email, userId)
  } catch (err) {
    console.error('[audience] could not link an address to its account:', err)
  }
}
